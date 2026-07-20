# GitHub publishing — server-side setup (Dima, one-time)

Publishing from the admin (offers, reviews, prices, page text, offer images) works by
committing to the GitHub repo. **The token used for that now lives as a Cloudflare
secret, never in the browser.** The admin calls a Worker proxy
(`/admin/api/github`) which injects the token, owns the repo/branch, and only allows
writes to the site's own data + page files.

This is a one-time setup. After it's done, Iulia never touches anything — there are no
token fields in the admin any more.

---

## 1. Create a fine-grained GitHub token

On GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.**

- **Token name:** `LumiDerm admin publisher`
- **Expiration:** your choice (e.g. 90 days or 1 year — set a calendar reminder to rotate)
- **Resource owner:** your GitHub account (DimaVasiliu)
- **Repository access:** *Only select repositories* → **DimaVasiliu/LumiDerm**
- **Permissions → Repository permissions → Contents:** **Read and write**
  (that's the only permission needed; leave everything else "No access")
- Generate, then **copy the token** (starts with `github_pat_...`). You won't see it again.

Keeping it scoped to just this repo with only Contents access means that even if the
token leaked, it could only edit this one repository's files — nothing else.

---

## 2. Store it as a Cloudflare secret

From `~/Desktop/LumiDerm`:

```
npx wrangler secret put GITHUB_TOKEN
```

Paste the token when prompted. It's stored encrypted on Cloudflare and is **never**
committed to git or sent to the browser.

(The repo and branch are not secrets, so they're already in `wrangler.jsonc` as
`GITHUB_REPO` = `DimaVasiliu/LumiDerm` and `GITHUB_BRANCH` = `main`.)

---

## 3. Deploy

```
rm -f .git/index.lock
git pull --rebase origin main
git add -A
git commit -m "Move GitHub publishing server-side (token as Cloudflare secret)"
git push origin main
```

---

## 4. Check it works

1. Open the admin → **Settings**. Under **Publishing → Website connection**, click
   **Check connection**. It should say *"Connected — publishing is handled securely on
   the server (DimaVasiliu/LumiDerm · main)."*
2. Make a tiny edit (e.g. an offer) and **Publish**. It should go live as before.

If Check connection says *"Not set up yet"*, the `GITHUB_TOKEN` secret is missing —
redo step 2 and redeploy.

---

## Rotating the token later

When the token nears expiry (or if it's ever exposed):

1. Generate a new fine-grained token (step 1).
2. `npx wrangler secret put GITHUB_TOKEN` with the new value.
3. Delete the old token on GitHub.

No code change or redeploy is needed — the Worker picks up the new secret immediately.

---

## What changed (for reference)

- The admin **no longer stores a GitHub token, repo, or branch** in the browser. The old
  token (if any) is auto-purged from `localStorage` the next time the admin loads.
- All GitHub calls go through the Worker proxy, which is protected by **Cloudflare Access
  + `ADMIN_EMAILS`** and restricts writes to an **allowlist** of site files
  (`assets/data/*.json`, `index.html`, `pages/*.html`, `assets/images/*`). It cannot be
  used to write `wrangler.jsonc`, the worker, workflows, or anything outside the site.
- The site's Content-Security-Policy no longer allows the browser to connect to
  `api.github.com` at all (removed from `connect-src`), since the browser never talks to
  GitHub directly now.
