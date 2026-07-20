# Website signups — setup & how it works

Collect new-client emails on the website, with proper UK GDPR/PECR consent, stored securely and visible in the admin. Feeds the email marketing we already built.

**One-time technical setup is Dima's. After that, Iulia just watches the Subscribers tab fill up.**

---

## What it does

1. A gentle popup appears once per visitor (after ~18s) inviting them to join the list.
2. They enter first name + email (last name, birthday day/month, and interest are optional) and **tick an unticked consent box**.
3. They get a **confirmation email** (double opt-in). They're only added once they click the link.
4. Confirmed subscribers appear in **Admin → Subscribers**, where Iulia can export them to CSV and feed them into **Send email**.
5. Unsubscribes (from any campaign) are recorded automatically and never emailed again.

Personal data lives in a **Cloudflare D1 database** — never in the website's git repo.

---

## The law (why it's built this way)

Under UK GDPR + PECR, marketing consent must be a clear, unticked opt-in; specific and unbundled; informed (privacy notice linked); and **recorded** (who/when/what wording). Every email needs an easy unsubscribe. Fines are now up to £17.5M / 4% of turnover, so this is built to the ICO standard:

- Unticked consent box, privacy notice linked at the point of signup.
- Double opt-in (ICO calls it "strong evidence of valid consent").
- Consent record stored: timestamp, wording, source, IP.
- One-click unsubscribe on every email + suppression list.
- Data minimisation: birthday is **day + month only** — no birth year, no age.

Not legal advice — but it follows current ICO guidance. See the updated **Privacy** page.

---

## One-time setup (Dima)

Prerequisite: the email sending is already set up (Resend + secrets). This reuses it.

### 1. Create the database

```bash
cd ~/Desktop/LumiDerm
npx wrangler d1 create lumidermdb
```

It prints a `database_id`. Paste it into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

### 2. Create the table

```bash
npx wrangler d1 migrations apply lumidermdb --remote
```

(The `--remote` flag applies it to the live database, not a local one.)

### 3. Deploy

Same rule as always — **`git push`, never `npx wrangler deploy`.**

```bash
rm -f .git/index.lock
git pull --rebase origin main
git add -A
git commit -m "Add website signups (double opt-in, D1, admin subscribers)"
git push origin main
```

### 4. Check it's live

```bash
curl -s https://lumidermaesthetics.com/api/health
```

You want `"subscribers":true` in the response. If it's `false`, the D1 binding didn't attach — recheck the `database_id` in `wrangler.jsonc`.

### 5. Add the ICO registration number

Once the ICO registration comes through, open `lumi-derm-website/pages/privacy.html`, find `data-ico-number`, and replace the placeholder text with the real reference (e.g. "under registration number ZB123456").

---

## How Iulia uses it

- **Admin → Subscribers** shows everyone who signed up, their status (Confirmed / Pending / Unsubscribed), and when they consented.
- **Export confirmed (CSV)** downloads the consented list.
- In **Send email → Step 1**, drop that CSV in to email them (they already have consent, so all rows are kept).
- **Delete** removes someone permanently — use it if a person asks to be erased.

She never touches the database or any code.

---

## Testing it yourself

1. Open the site in a private/incognito window (so the "seen" flag is fresh), wait ~18s for the popup — or run `localStorage.clear()` in the browser console and reload.
2. Sign up with your own email.
3. Check your inbox for the confirmation email → click **Confirm subscription**.
4. In Admin → Subscribers → **Reload** — you should appear as **Confirmed**.

To re-trigger the popup during testing: browser console → `localStorage.removeItem('lumiSignupSeen'); localStorage.removeItem('lumiSubscribed')` → reload.

---

## Troubleshooting

**Popup never appears** — you've already seen it (localStorage). Clear it as above, or use incognito.

**"Signups aren't set up yet"** — the D1 binding is missing. Check `database_id` in `wrangler.jsonc` and that the migration ran.

**Confirmation email doesn't arrive** — same Resend setup as campaigns; check `/api/health` shows `resend:true`. Also check spam.

**Subscribers tab says "Add your send key"** — paste the SEND_KEY in Settings → Sending connection (same key as the email sender).

**Someone signed up but stays "Pending"** — they haven't clicked the confirmation link yet. Only Confirmed subscribers can be emailed.
