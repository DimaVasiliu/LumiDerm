# Email sending — setup

One-time technical setup. **Dima does this once; Iulia never sees it.**

After this, she opens `/admin/` → **Send email** → drops in the Treatwell CSV → ticks offers → **Send**.

---

## Where things stand

From the client export of 14 July 2026:

| | |
|---|---|
| Clients in Treatwell | **167** |
| Opted in (`opt-in state = Y`) with a valid email | **15** |
| Not opted in | **152** |
| …of whom have actually booked before | **70** |

**We can only email the 15.** The importer enforces this — it reads the `opt-in state` column and discards every `N` row automatically. There is no setting to override it short of deliberately choosing "I have consent another way".

The real job is turning those 70 into opted-in clients. Iulia asks at checkout — *"Would you like to hear about our offers by email?"* — and ticks the box in Treatwell. Re-export in a few months and the list will be worth sending to.

---

## 1. Resend account

1. Sign up at [resend.com](https://resend.com). Free tier is far more than enough for 15–200 recipients.
2. **Domains → Add Domain** → `lumidermaesthetics.com`.
3. Resend shows you DNS records to add (an MX or TXT for verification, plus DKIM `CNAME`/`TXT` records).

## 2. DNS in Cloudflare

### What is already there (checked 14 July 2026 — do not break it)

The root domain already carries Namecheap email-forwarding records:

```
MX    (root)     eforward1–5.registrar-servers.com
TXT   (root)     v=spf1 include:spf.efwd.registrar-servers.com ~all
TXT   (_dmarc)   v=DMARC1; p=none; rua=mailto:info@lumidermaesthetics.com
```

> ### ⚠️ Never add a second SPF record
> A domain may have **exactly one** SPF TXT record. Adding a second makes SPF hard-fail
> and breaks **all** mail from the domain, including the forwarding already in use.
> If a provider ever tells you to add SPF at the root, **merge the `include:` into the
> existing record** instead of creating a new one.

Resend sidesteps this by putting its records on a **`send.` subdomain**, so the root SPF and MX stay untouched.

**DMARC already exists — do not add another.**

### What to add

In Cloudflare → `lumidermaesthetics.com` → **DNS → Records → Add record**, enter exactly what Resend generates for you. It will look like this (the DKIM key is unique to your account):

| Type | Name — type exactly this | Content | Proxy |
|---|---|---|---|
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` · priority `10` | DNS only |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | DNS only |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3...` | DNS only |

Two traps:

- **Grey cloud (DNS only), never orange (Proxied).** Proxying breaks DKIM.
- **Cloudflare appends the domain for you.** Type `send`, not `send.lumidermaesthetics.com`, or you'll create `send.lumidermaesthetics.com.lumidermaesthetics.com`.

Then hit **Verify** in Resend. Usually a few minutes.

### Why this matters

Without DKIM + aligned SPF, the emails go to spam. With the `send.` subdomain, the bounce address aligns with the root under relaxed SPF, DKIM signs as `d=lumidermaesthetics.com`, and the existing DMARC record passes — so mail from `info@lumidermaesthetics.com` authenticates properly.

### Not a bug

`www` is a CNAME to `parkingpage.namecheap.com`. It looks wrong, but it's proxied and 301-redirects to the apex correctly. Untidy, harmless. Leave it.

## 3. Create the unsubscribe store

```bash
cd ~/Desktop/LumiDerm
npx wrangler kv namespace create SUPPRESSION
```

It prints an `id`. Paste it into `wrangler.jsonc`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

## 4. Set the secrets

Generate two long random strings:

```bash
openssl rand -hex 32   # this is SEND_KEY   — give this one to Iulia
openssl rand -hex 32   # this is UNSUB_SECRET — nobody needs to see this
```

Then:

```bash
npx wrangler secret put RESEND_API_KEY   # paste the key from resend.com
npx wrangler secret put SEND_KEY         # paste the first random string
npx wrangler secret put UNSUB_SECRET     # paste the second random string
```

Secrets live on the Worker, not in the repo. They survive deploys.

## 5. Check `FROM_EMAIL`

In `wrangler.jsonc` both are set to `info@lumidermaesthetics.com` — the mailbox already wired to Namecheap forwarding and named in the DMARC record, so replies actually reach her.

`FROM_EMAIL` must be **on the domain verified in step 2**. It does not need its own mailbox (DKIM is what authorises it), but `REPLY_TO` **must** be an address she genuinely reads. Don't point it at an address nobody checks.

## 6. Deploy

Same rule as always — **`git push`, never `npx wrangler deploy`.** The admin page commits to GitHub behind your back, and Cloudflare's Git build will overwrite anything you push locally.

```bash
git pull --rebase origin main
git add -A
git commit -m "Add email sending"
git push origin main
```

## 7. Lock down the admin

**Do this. It is the last thing standing between the internet and her client list.**

Cloudflare → **Zero Trust → Access → Applications → Add an application** → Self-hosted:

- Domain: `lumidermaesthetics.com`, path: `admin`
- Policy: Allow → Emails → Iulia's address and yours

Repeat for `cms` if it's still there. Without this, anyone who finds `/admin/` can read the send key out of the page and email your clients.

## 8. Hand over the key

Give Iulia the `SEND_KEY` string once. She pastes it into **Settings → Sending connection → Send key → Save key**, then clicks **Test sending**. It should say *Ready*.

That's it. She never touches any of this again.

---

## How she sends a campaign

1. **Treatwell → Clients → Export** → downloads the CSV.
2. **Admin → Send email → Step 1** → drop the CSV in. It reports something like *"15 recipients ready · 152 dropped (no marketing consent)"*.
3. **Step 2** → pick a template, edit the words, tick which published offers to feature. `{{name}}` becomes each client's first name.
4. **Step 3** → **Send test to me** first. Always. Check it on a phone.
5. Tick the consent confirmation → **Send campaign**.

Offers come straight from what she published in the Offers tab — she never retypes a price.

## Unsubscribes

Every email carries a signed unsubscribe link and a one-click `List-Unsubscribe` header (which is what Gmail and Outlook require). One click writes the address to the KV suppression store, and the Worker refuses to send to it ever again — even if it's still sitting in a CSV she uploads later.

She doesn't have to manage this. It just works.

---

## Troubleshooting

**"No API found. Has the Worker been deployed?"** — `wrangler.jsonc` needs `main: "src/worker.js"`. Check it deployed as a Worker, not a static-assets-only project.

**"Server is missing: …"** — that secret didn't get set. Re-run `npx wrangler secret put NAME`.

**"Unauthorised. Check the send key in Settings."** — the key in the browser doesn't match the `SEND_KEY` secret. Re-paste it.

**Emails land in spam** — domain isn't verified, or the DKIM records are proxied (orange cloud) instead of DNS-only. Go back to step 2.

**Test works, real send fails** — likely more than 500 recipients, or Resend's free-tier daily cap. Split the list.
