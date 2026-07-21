# Media library (image uploads) — setup

Iulia can upload her own images in **Media** and **Send email**. They're stored in
**Cloudflare R2** (object storage, free tier: 10 GB) and served from
`https://lumidermaesthetics.com/media/<key>` — a stable URL that works on the site,
in offers, and in email campaigns.

**Why R2 and not D1:** D1 is a SQL database for structured data (subscribers, campaigns,
audit log). Images are files, not rows — they belong in object storage. R2 is the right,
cheap, scalable place for them.

---

## One-time setup (Dima)

1. **Enable R2** in the Cloudflare dashboard (Storage & Databases → R2). If prompted, add
   a payment method — the free tier (10 GB storage, generous reads) is enough here.

2. **Create the bucket** (name must match `wrangler.jsonc`), from `~/Desktop/LumiDerm`:
   ```
   npx wrangler r2 bucket create lumiderm-media
   ```

3. **Deploy** so the Worker picks up the `MEDIA` binding + the new routes:
   ```
   rm -f .git/index.lock
   git pull --rebase origin main
   git add -A
   git commit -m "Add R2 media library (upload images for offers + email)"
   git push origin main
   ```

4. **Check it's live:** open Admin → Settings → **System status**; publishing/DB/email
   show connected as before. Then open **Media**, click **Upload image**, pick a photo —
   it should appear in the grid within a second, tagged *Uploaded*.

---

## How Iulia uses it

- **Media tab:** click **Upload image** to add any photo. Uploaded images show a **Delete**
  button; the built-in stock images are read-only.
- **Offers:** in the offer editor's image dropdown, uploaded images appear alongside the
  stock ones — pick one and publish.
- **Send email:** add an optional **banner image** at the top of a campaign — upload or
  pick an existing one.

Uploaded images are public (anyone with the exact `/media/...` link can view them), which
is required for them to show in emails. Don't upload anything confidential.

---

## Notes

- Max upload size is **6 MB** per image; only image files are accepted.
- Deleting an image here removes it from R2 immediately. If an offer/email still points at
  it, that image will stop loading — so delete only images you're no longer using.
- Every upload/delete is recorded in the **Activity log** (Settings).
