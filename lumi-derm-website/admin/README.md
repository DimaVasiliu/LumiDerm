# Lumi Derm Admin — Control Room

A private, product-ready admin workspace at `/admin/`. It runs entirely in the browser
today (drafts saved to `localStorage`); every action is built so a real API/CMS/Square key
can be dropped in later **without changing the UI**.

> **Before sharing the URL:** protect `/admin` with **Cloudflare Access**. The built-in
> passcode is only a light lock for shared screens, not real security.

## How to open it
Go to `lumidermaesthetics.com/admin/`. Enter the passcode (default `lumiderm`, change it in
**Settings → Access**). It's `noindex,nofollow` so search engines ignore it.

## What's in it (and what each part is for)

| Panel | What Iulia does here | Wires to later |
|------|----------------------|----------------|
| **Overview** | Live counts (offers live, reviews pending, campaign drafts, subscribers), a "today's to-do" list, and quick-action shortcuts. | Real metrics from Square + the site data. |
| **Offers** | Add / edit / **duplicate / delete / reorder** homepage offer cards, set status (Published/Draft/Hidden), with a **live card preview**. | Writes `assets/data/offers.json` via CMS, homepage renders from it. |
| **Prices** | Manage price groups and rows, rename or delete groups, edit consultation/instalment wording. | Writes structured price JSON; Square stays the source of paid items. |
| **Marketing** | **Compose email/offer campaigns** from templates (new offer, newsletter, birthday, win-back), pick an audience, see a **live email preview**, save/duplicate drafts, **copy text**, and manage the **subscriber list** (add / import CSV / export CSV). | "Send in Square" → Square Marketing API; subscribers sync to Square Customer Directory. |
| **Reviews** | Approve / feature / hide / set pending; import a Google review (demo). | Google Business Profile sync Worker → pending queue. |
| **Media** | Browse the local image library used by offers/gallery. | Real uploads via CMS media or a protected Worker upload endpoint. |
| **Pages** | Edit hero copy, clinic contact details; see legal & SEO status. | CMS fields that publish to the live pages. |
| **Clients** | One-click into Square Appointments, Customer Directory and Marketing. | — (Square is the system of record). |
| **Settings** | Change the passcode, **export/import a full backup**, **reset to defaults**, and see the integration checklist + publishing model. | Cloudflare Access, Sveltia CMS/GitHub OAuth, D1/R2 API. |

## Global features
- **Autosave** to the browser with a "Saved … " timestamp in the header.
- **Export / Import** a full JSON backup of everything (top bar + Settings).
- **Reset to defaults** to undo all local changes.
- Toast confirmations, keyboard-friendly, responsive (sidebar on desktop, top tabs on mobile),
  reduced-motion support, and the clinic's brand styling.

## Why it's built this way
The interface is **complete and final-feeling now**, but the data layer is deliberately
swappable. Each "Save" currently writes to `localStorage`; to go live you replace those
calls with: a **CMS commit** (offers/prices/pages → GitHub → Cloudflare redeploy) and
**Square API** calls (campaigns, subscribers, reviews). Nothing in the screens has to change.

## Next steps to make it fully live
1. **Cloudflare Access** on `/admin` (real auth).
2. **Sveltia CMS + GitHub OAuth** so Save publishes offers/prices/pages.
3. **Square API keys** for sending campaigns and syncing the customer/subscriber list.
4. Optional **Google reviews Worker** for the reviews queue.
