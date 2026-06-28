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
