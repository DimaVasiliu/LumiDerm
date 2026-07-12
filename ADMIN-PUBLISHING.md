# Admin → Website: how offers go live

**For Iulia it's three steps:** open `/admin/` → create the offer → click **Publish offers**. About a minute later it's on the homepage. She never sees GitHub.

To make that work, **you set it up once** (10 minutes). She never repeats this.

---

## How it works (so you know)

The homepage reads its offers from one file:

```
lumi-derm-website/assets/data/offers.json
```

When Iulia clicks **Publish offers**, the admin writes that file straight to GitHub. Cloudflare sees the commit and rebuilds the site (~1 min). That's the whole loop.

---

## One-time setup

### 1. Create a token

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**

- **Token name:** `Lumi Derm admin`
- **Expiration:** 1 year (put a reminder in your calendar to renew)
- **Repository access:** *Only select repositories* → pick **your LumiDerm repo**
- **Permissions → Repository permissions → Contents:** set to **Read and write**
  *(leave everything else alone)*

Generate it and copy the token (starts `github_pat_…`). You only see it once.

> This token can **only** edit files in this one repo. It cannot touch bookings, payments, client data, or any other repo.

### 2. Connect the admin

Open `https://lumidermaesthetics.com/admin/` → **Settings** → *Website connection*:

| Field | Value |
|---|---|
| Repository | `YOUR-USERNAME/YOUR-REPO` (e.g. `DimaVasiliu/LumiDerm`) |
| Branch | `main` |
| Access token | paste the token |

Click **Save connection**, then **Test connection**. You want:

> *"Connected. Found offers.json — publishing will work."*

If it says the token was rejected, the Contents permission isn't set to *Read and write*.

### 3. Lock the admin down — do not skip this

The token lives in the browser, so `/admin/` must not be public.

Cloudflare dashboard → **Zero Trust → Access → Applications → Add an application** → *Self-hosted*

- **Domain:** `lumidermaesthetics.com`, **Path:** `admin`
- **Policy:** Allow → *Emails* → Iulia's email + yours

Do the same for `/cms`. Both are already `noindex` + blocked in `robots.txt`, but that only stops search engines, not people.

---

## What Iulia does (every time)

1. Open `/admin/` → **Offers**
2. **Add offer** (or click *Edit* on one), fill in the fields, **Save offer**
3. Click **Publish offers**
4. Wait ~1 minute, refresh the homepage

### The fields

| Field | What it does |
|---|---|
| **Title** | The offer headline |
| **Category** | Small label above the title |
| **Display price** | e.g. `From £34`, `£90`, `Save up to 30%` |
| **Badge** | Small tag on the preview image |
| **Short description** | One line under the title |
| **Image** | Pick from the clinic's images |
| **Links to treatment** | Sends the client straight to that treatment when they book |
| **Status** | `Live` shows it · `Draft` hides it without deleting |
| **End date** | The offer **removes itself** from the site after this date |
| **Note** | Shown instead of a date for ongoing offers (e.g. "Always on") |
| **Featured** | Shows first, with a "Featured" tag |

### Built-in safety

- **Drafts never appear** on the website.
- **Expired offers disappear on their own** — no stale promotions.
- If every offer is removed or expires, the homepage shows a tidy message linking to the treatment menu instead of an empty gap.
- **Reload from website** pulls back whatever is currently live, if she wants to undo unpublished edits.
- Every publish is a normal git commit, so **anything can be rolled back**.

---

## Troubleshooting

| Message | Fix |
|---|---|
| *"Add the website connection first"* | Settings → fill in repo + token |
| *"The token was rejected"* | Token needs **Contents: Read and write** on that repo |
| *"offers.json was not found"* | The repo path is wrong — it must be `lumi-derm-website/assets/data/offers.json` |
| Published but site unchanged | Give it a minute, then hard-refresh (Cmd/Ctrl+Shift+R). Check the Cloudflare deployment ran. |

## Later, if you want to remove the token from her browser

The publish button calls one function (`publishOffers` in `admin/admin.js`). Point it at a small Cloudflare Worker that holds the token server-side instead, and **nothing changes for Iulia** — same button, same flow.
