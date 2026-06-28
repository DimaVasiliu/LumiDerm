# Manual Actions Required

External owner/developer actions are recorded here. Completion requires evidence; the presence of
instructions or supporting code is not evidence that a provider action is complete.

## DEV-NPM-001 Install and lock Phase 0 development tools

- **Status:** COMPLETE
- **Owner:** Developer
- **Service:** npm Registry
- **Why it is needed:** Reproducible linting and formatting require the pinned development tools and
  a reviewed lockfile.
- **Open:** <https://www.npmjs.com/status>
- **Steps:**
  1. Confirm the npm status page reports normal registry operation and the development machine can
     reach `https://registry.npmjs.org/`.
  2. From the repository root, run `npm install --ignore-scripts` using Node 22.x and npm 10.x.
  3. Confirm `package-lock.json` is created and review that it contains no private registry URL or
     authentication token.
  4. Run `npm run lint` and `npm run format:check`.
  5. Do not auto-fix the legacy site in Phase 0. Return the complete command output so existing
     findings can be assigned to the correct implementation phase.
  6. Ask Codex to review and commit `package-lock.json` with the Phase 0 tooling before Phase 1 is
     closed.
- **Values to enter:** no credentials or values are required; use the public npm registry and the
  exact dependency versions in `package.json`.
- **Return to Codex with:** Node/npm versions, whether install succeeded, and complete lint/format
  results. Do not send the `node_modules` directory.
- **Never send:** npm authentication tokens, private registry credentials, passwords, or session
  cookies.
- **Verification:** Completed 28 June 2026. The pinned dependencies installed successfully,
  `package-lock.json` uses the public npm registry and contains no authentication/password fields,
  and all Phase 0 checks were rerun. Existing failures are recorded in `IMPLEMENTATION_STATUS.md`;
  they were not hidden or auto-fixed.

## CF-GIT-001 Reconnect Cloudflare Workers GitHub integration

- **Status:** REQUIRED BEFORE LAUNCH
- **Owner:** Developer
- **Service:** Cloudflare
- **Why it is needed:** The audit reports that pushes no longer trigger Cloudflare builds, so the
  production delivery path is not reliable or verifiable.
- **Open:** <https://dash.cloudflare.com/> and <https://github.com/settings/installations>
- **Steps:**
  1. In Cloudflare, open **Workers & Pages** -> **lumiderm** -> **Settings** -> **Builds**.
  2. Under **Git Repository**, select **Manage**. If the existing installation is stale, disconnect
     it before reconnecting.
  3. Select GitHub. When GitHub opens, install or configure the Cloudflare Workers and Pages app for
     the account that owns `DimaVasiliu/LumiDerm`.
  4. Grant repository access to **Only select repositories** -> `DimaVasiliu/LumiDerm`. Do not grant
     unnecessary organization-wide access.
  5. Return to the Worker build settings and select repository `DimaVasiliu/LumiDerm`.
  6. Set production branch to `main`, root directory to `/`, build command to blank, and deploy
     command to `npx wrangler deploy`.
  7. Confirm the Worker/project is `lumiderm`, matching `wrangler.jsonc`, then save without
     triggering an unreviewed deployment.
  8. After Codex receives explicit permission to push, push one harmless reviewed commit and open
     **lumiderm** -> **Deployments** -> **Build history**. Confirm a successful build and active
     deployment for the same commit SHA.
- **Values to enter:** repository `DimaVasiliu/LumiDerm`; branch `main`; root `/`; build command
  blank; deploy command `npx wrangler deploy`; Worker `lumiderm`.
- **Return to Codex with:** the non-secret build status, build/deployment ID, tested commit SHA, and
  whether the GitHub app is restricted to this repository.
- **Never send:** GitHub passwords, Cloudflare credentials, API tokens, recovery codes, or session
  cookies.
- **Verification:** Codex will compare the reported commit SHA with Git, inspect Cloudflare build
  status when authorised, and make a read-only request to the production site. No push or deploy is
  authorised by this entry.

## CF-ACCESS-001 Protect the production admin with Cloudflare Access

- **Status:** BLOCKING
- **Owner:** Developer
- **Service:** Cloudflare
- **Why it is needed:** `/admin/` is publicly reachable and the current browser passcode is
  bypassable. Real customer, subscriber, or clinic data must not be entered until Access is
  verified.
- **Open:** <https://one.dash.cloudflare.com/>
- **Steps:**
  1. Obtain Iulia's confirmed admin email and the single approved developer email. Do not guess or
     use an email domain-wide rule.
  2. In Cloudflare Zero Trust, open **Access controls** -> **Applications** -> **Create new
     application** -> **Self-hosted and private**.
  3. Name the application `Lumi Derm Admin` and add public hostname `lumidermaesthetics.com/admin/*`
     using HTTPS.
  4. Create an **Allow** policy named `Approved Lumi Derm admins` with **Include** -> **Emails** and
     add only the two confirmed full email addresses. Do not choose **Everyone**, **Emails ending
     in**, or all one-time-PIN users.
  5. Select the owner-approved identity provider. If exactly one identity provider is enabled,
     enable instant authentication. Use an appropriately short session duration for an admin
     application and save.
  6. In a signed-out/private browser, open `https://lumidermaesthetics.com/admin/`. Confirm Access
     authentication appears before any admin HTML is returned.
  7. Authenticate as each approved identity and confirm access. Then test an unapproved identity and
     confirm denial.
  8. Confirm `https://lumidermaesthetics.com/admin/index.html` is also protected. Record the Access
     application ID and audience (`AUD`) value for the later server-side JWT configuration; these
     IDs are not secrets.
- **Values to enter:** application name `Lumi Derm Admin`; hostname/path
  `lumidermaesthetics.com/admin/*`; policy action `Allow`; selector `Emails`; exactly Iulia's
  confirmed email and one approved developer email.
- **Return to Codex with:** the two approved email addresses, non-secret Access application ID,
  non-secret audience (`AUD`) value, identity-provider name, session duration, and pass/deny test
  results.
- **Never send:** passwords, one-time codes, Access cookies/JWTs, API tokens, identity-provider
  secrets, or recovery codes.
- **Verification:** Codex will make unauthenticated read-only requests to `/admin/` and
  `/admin/index.html` and confirm they are intercepted by Access; the owner/developer will verify
  successful authorised login and denied unauthorised login.

## SQUARE-CATALOG-001 Remove the example haircut service

- **Status:** BLOCKING
- **Owner:** Iulia
- **Service:** Square
- **Why it is needed:** The live booking catalogue reportedly exposes `Haircut (example service)`,
  which is not an approved Lumi Derm treatment and must not remain customer-bookable.
- **Open:** <https://squareup.com/dashboard/items/services>
- **Steps:**
  1. Sign in to the Lumi Derm Square account and open **Items & services** -> **Items** -> **Service
     library**.
  2. Search for the exact service `Haircut (example service)` and open it.
  3. First turn off **Online booking** for every variation/location so it is immediately removed
     from the customer booking flow.
  4. Confirm there are no legitimate appointments, reports or integrations that depend on this
     example record. Then use the service action menu to delete/archive it and confirm the action.
  5. Open **Appointments** -> **Online Booking** -> **Channels**, preview the published booking
     site, and search every service category to confirm the haircut entry is absent.
- **Values to enter:** none; remove only the exact example service. Do not edit a similarly named
  real service.
- **Return to Codex with:** confirmation that online booking is off and the non-secret service name,
  deletion/archive status, and date checked.
- **Never send:** Square password, access token, card/payment data, customer details, appointment
  details, or recovery codes.
- **Verification:** Codex will make a read-only visit to the public Square booking flow after owner
  approval and confirm the example service is not offered. No booking will be submitted.

## SQUARE-CATALOG-002 Reconcile the website and Square service catalogue

- **Status:** REQUIRED BEFORE LAUNCH
- **Owner:** Iulia
- **Service:** Square
- **Why it is needed:** Website prices and treatment names cannot be declared accurate until the
  owner compares them with Square's service variations, duration, staff, location and online
  availability.
- **Open:** <https://squareup.com/dashboard/items/services>
- **Steps:**
  1. Open **Items & services** -> **Items** -> **Service library** in Square Dashboard.
  2. Compare each website treatment/price row with the approved master list and the corresponding
     Square service variation.
  3. For every variation, confirm customer-facing name, fixed/variable price, duration, category,
     assigned location, eligible team member and **Online booking** setting.
  4. Open **Appointments** -> **Online Booking** -> **Channels** -> preview the booking site and
     confirm only intended services are visible and bookable.
  5. Record mismatches in a non-secret table containing website label, approved value, Square label,
     price, duration and availability. Do not change public prices until Iulia explicitly approves
     the corrected list.
- **Values to enter:** only Iulia's approved names, prices, durations, location/staff assignments
  and availability; no values may be inferred from this website.
- **Return to Codex with:** the approved non-secret comparison table and confirmation of which value
  is authoritative for every mismatch.
- **Never send:** customer exports, appointment records, access tokens, passwords, card data or
  internal payment details.
- **Verification:** Codex will compare the supplied approved table against public HTML/JSON and, in
  Phase 8, the read-only Square reconciliation output.

## SQUARE-FLOW-001 Verify booking, payment, cancellation and refund

- **Status:** REQUIRED BEFORE LAUNCH
- **Owner:** Iulia
- **Service:** Square
- **Why it is needed:** The website no longer claims full prepayment because the actual Square
  payment/cancellation configuration and end-to-end customer flow are not yet verified.
- **Open:** <https://squareup.com/dashboard/appointments/settings/payments>
- **Steps:**
  1. In Square Dashboard open **Appointments** -> **Settings** -> **Payments & cancellations**.
  2. Record the selected booking payment policy: no requirement, deposit, full prepayment or card
     hold/no-show protection. Record the cancellation cutoff and whether clients may cancel or
     reschedule before it.
  3. Confirm the displayed Square policy wording matches the clinic-approved website policy. If it
     does not, stop and obtain owner/legal wording approval before changing either system.
  4. With an owner-approved low-value real service and payment method, complete one mobile and one
     desktop booking from the public website. Never use the example haircut service.
  5. Confirm the correct service, practitioner, location, duration, amount/deposit, confirmation and
     reminder behavior.
  6. Test owner-approved rescheduling and cancellation. If money was taken, follow Square's refund
     flow from the cancelled appointment or **Transactions** -> payment -> **Issue refund**.
  7. Confirm the refund status in Square and on the test payment method, then remove/anonymise test
     notes where operationally appropriate.
- **Values to enter:** only the clinic-approved payment/cancellation policy and an owner-authorised
  low-value test appointment.
- **Return to Codex with:** non-secret policy selection, cutoff, service name, device/browser, pass
  or fail for booking/confirmation/reminder/reschedule/cancel/refund, and refund completion status.
- **Never send:** card numbers, payment receipts containing personal data, customer data, passwords,
  access tokens or recovery codes.
- **Verification:** Codex will compare the reported policy with the public wording and record the
  owner-signed test evidence; Codex will not initiate a paid booking or refund without separate
  explicit authorisation.

## CF-HEADERS-001 Verify production security and cache headers

- **Status:** REQUIRED BEFORE LAUNCH
- **Owner:** Developer
- **Service:** Cloudflare
- **Why it is needed:** Phase 1 headers pass in Wrangler locally but cannot be claimed live until an
  explicitly authorised deployment is complete.
- **Open:** <https://dash.cloudflare.com/>
- **Steps:**
  1. Do not deploy from this action alone. After the owner separately approves a Phase 1 deployment,
     open **Workers & Pages** -> **lumiderm** -> **Deployments** and confirm the Phase 1 commit is
     the active version.
  2. Open the homepage, a CSS asset, `assets/data/reviews.json`, `/admin/`, and a nonexistent path
     in a private browser or with a read-only header request.
  3. Confirm the homepage has CSP, HSTS, Permissions-Policy, Referrer-Policy, X-Content-Type-Options
     and X-Frame-Options.
  4. Confirm HTML/data revalidate, versioned CSS/JS is immutable for one year, `/admin/` is
     `private, no-store`, and the nonexistent path returns the branded page with HTTP 404.
  5. Test Square and Google only after an explicit external-media choice and confirm the browser
     reports no CSP violations for their retained origins.
- **Values to enter:** none.
- **Return to Codex with:** active non-secret deployment ID/commit SHA and the response
  status/header results for each tested URL.
- **Never send:** Cloudflare credentials, API tokens, Access JWTs/cookies, passwords or recovery
  codes.
- **Verification:** Codex will repeat read-only production header and consent-loading checks after
  deployment is explicitly authorised. No deployment is authorised by this entry.
