# Lumi Derm — CMS setup (so Iulia can publish offers herself)

The homepage "Treatments & offers" section is now **data-driven**. It renders from:

```
lumi-derm-website/assets/data/offers.json
```

Editing that file (by hand, or through the CMS below) updates the website. Nothing else needs to change.

The CMS lives at **`https://lumidermaesthetics.com/cms/`**. It's [Sveltia CMS](https://github.com/sveltia/sveltia-cms) — a git-based editor. When Iulia hits **Publish**, it commits `offers.json` to GitHub, and Cloudflare rebuilds the site (~1 minute). You get full version history and can roll back any change.

There is a **one-time setup** (about 15 minutes) because GitHub requires a login app.

---

## Step 1 — Create a GitHub OAuth App

1. Go to GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name:** `Lumi Derm CMS`
   - **Homepage URL:** `https://lumidermaesthetics.com`
   - **Authorization callback URL:** `https://lumiderm-cms-auth.<your-subdomain>.workers.dev/callback`
     (you'll get this exact URL in Step 2 — you can come back and correct it)
3. Click **Register application**.
4. Copy the **Client ID**, then click **Generate a new client secret** and copy that too. Keep both safe.

## Step 2 — Deploy the auth Worker

This tiny Cloudflare Worker holds the secret and handles the GitHub login. It is the official one from the Sveltia project.

```bash
git clone https://github.com/sveltia/sveltia-cms-auth.git
cd sveltia-cms-auth
npx wrangler deploy
```

Then add your secrets:

```bash
npx wrangler secret put GITHUB_CLIENT_ID       # paste the Client ID
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the Client Secret
npx wrangler secret put ALLOWED_DOMAINS        # lumidermaesthetics.com
```

Wrangler prints the Worker URL, e.g. `https://sveltia-cms-auth.yourname.workers.dev`.
Go back to the GitHub OAuth App and make sure the **callback URL** is that URL **+ `/callback`**.

## Step 3 — Point the CMS at your repo and Worker

Edit `lumi-derm-website/cms/config.yml` and set these three lines:

```yaml
backend:
  name: github
  repo: YOUR-GITHUB-USERNAME/YOUR-REPO   # e.g. DimaVasiliu/LumiDerm
  branch: main                            # your default branch
  base_url: https://sveltia-cms-auth.yourname.workers.dev   # the Worker URL from Step 2
```

Commit and push. Done.

## Step 4 — Use it

1. Iulia visits `https://lumidermaesthetics.com/cms/`
2. Clicks **Sign in with GitHub** (she needs write access to the repo — invite her as a collaborator)
3. Opens **Homepage offers**, edits/adds/removes an offer, clicks **Publish**
4. ~1 minute later it's live on the site

---

## What she can control per offer

| Field | What it does |
|---|---|
| **Title** | The offer headline |
| **Category** | Small label above the title |
| **Short description** | One line under the title |
| **Price** | e.g. `From £34`, `£90`, `Save up to 30%` |
| **Badge** | Small tag on the preview image |
| **Image** | Upload a new one or pick an existing image |
| **Links to treatment** | Sends the client straight to that treatment when booking |
| **Status** | `Live` shows it; `Draft` hides it without deleting |
| **Featured** | Shows first, with a "Featured" tag |
| **End date** | Offer **disappears automatically** after this date |
| **Note** | Shown instead of a date for ongoing offers (e.g. "Always on") |

## Built-in safety

- **Drafts never show** on the website.
- **Expired offers drop off automatically** — no stale promotions.
- If **all** offers are removed or expire, the section shows a graceful message linking to the full treatment menu rather than an empty gap.
- Offers are also published as **schema.org/Offer** structured data, so Google can surface them.

## Security

Protect the CMS from the public with **Cloudflare Access** (Zero Trust → Access → Applications):

- Application domain: `lumidermaesthetics.com`, path `/cms`
- Policy: allow only Iulia's and your email address

Do the same for `/admin` (the older internal dashboard).

## Note on the old `/admin` page

`/admin/` is the earlier prototype dashboard. It only saves to **localStorage in the browser** — it does *not* publish to the live site. `/cms/` is the one that actually publishes. Once you're happy with the CMS, `/admin` can be retired or kept as an internal scratchpad.
