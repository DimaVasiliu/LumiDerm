# Marketing consent & unsubscribe — end-to-end verification

Checked against the ICO's consent guidance (consent must be **active, specific,
informed, separate/unbundled, and recorded** — who/when/what/how) and PECR
electronic-mail marketing rules (valid opt-out on every message + a suppression /
do-not-contact list).

**Verdict: compliant by design.** Three gaps were found and fixed this pass (below).
One live test must be done after deploy (below).

---

## 1. How consent is captured (signup → double opt-in → record)

Website mailing-list signup (`js/signup.js`) → `POST /api/subscribe` → pending row +
confirmation email → `/api/confirm/<token>` → confirmed.

| ICO test | How it's met | Evidence |
|---|---|---|
| **Active** (opt-in, not pre-ticked) | Consent checkbox is **unticked** by default and **required** before submit. | `signup.js`: `<input type="checkbox" name="consent_email" value="1">` (no `checked`); JS blocks submit without it. |
| **Specific** | Consent is only for marketing email ("offers and news"), nothing bundled. | Single-purpose checkbox; lawful basis stated as consent in the Privacy page. |
| **Informed** | Purpose stated + **privacy notice linked at the point of consent**. | Checkbox label links `privacy.html`; Privacy page has a "Marketing & your consent" section naming the data collected and lawful basis. |
| **Separate / unbundled** | Consent is its own field, not tied to booking or any T&Cs. Booking runs separately via Treatwell. | Standalone checkbox; signup never blocks booking. |
| **Recorded** | See the four fields below. | D1 `subscribers` table. |
| **Double opt-in** (ICO: "strong evidence of valid consent") | Email is only added after the person clicks the confirmation link. | `handleSubscribe` → `handleConfirmByToken`. |

### The record (who / when / what / how)

| Field | Column | Notes |
|---|---|---|
| **Who** | `email`, `first_name`, `last_name` | Identifies the person. |
| **When** | `created_at` (consent given) + `confirmed_at` (verified) | Both timestamps stored. |
| **What they were told** | `consent_wording` | Stores the exact checkbox text. **Fixed this pass** so it matches the visible label word-for-word. |
| **How / where** | `consent_source` (e.g. `website popup` / `website booking`) + `signup_ip` | Captured server-side. |

Data minimisation: birthday is **day + month only** — no birth year/age (`signup.js`,
Privacy page). Honeypot field blocks bots. Consent records are viewable in
**Admin → Subscribers** (status, consent source + date, wording on hover).

---

## 2. Unsubscribe & suppression

| Requirement | How it's met | Evidence |
|---|---|---|
| **Every marketing email has a working opt-out** | Visible "Unsubscribe" link in the footer of every campaign **and** a one-click `List-Unsubscribe` / `List-Unsubscribe-Post` header (RFC 8058). | `sender.js` footer uses `{{unsubscribe}}`; the Worker injects a signed link + headers per recipient. |
| **Links can't be forged / used to unsubscribe others** | Unsubscribe links are **HMAC-signed** (`UNSUB_SECRET`); an invalid token is rejected. | `buildUnsubscribeUrl` / `handleUnsubscribe` with `timingSafeEqual`. |
| **Do-not-contact / suppression list** | Unsubscribes go to a Cloudflare KV suppression list; **every send re-checks it** and skips suppressed addresses. | `handleUnsubscribe` → KV `SUPPRESSION`; `deliverCampaign` / `handleSend` filter against it. |
| **Also reflected in the subscriber list** | Status set to `unsubscribed` with `unsubscribed_at`. | `handleUnsubscribe`. |
| **Withdrawing is as easy as giving** | Unsubscribe is one click; signing up needs a form + confirmation. | — |

---

## 3. Gaps found and fixed this pass

1. **Recorded wording didn't match the visible label.** The DB stored a paraphrase
   ("Yes, email me Lumi Derm Aesthetics offers and news. I understand I can
   unsubscribe at any time.") while the checkbox showed different wording. Aligned
   `CONSENT_WORDING` to the exact visible text so the record is accurate.
2. **Re-opt-in stayed suppressed.** If someone unsubscribed and later genuinely
   re-subscribed + confirmed, the old suppression entry silently blocked them. Now a
   completed double opt-in **clears the suppression entry** (only the mailbox owner
   can click the confirm link, so it can't be abused).
3. **Wrong Instagram link** in the campaign email footer (`lumiderm_aesthetics` →
   `lumi.derm.aesthetic`).

---

## 4. Live test to run AFTER deploy (5 minutes)

Do this once, in a private/incognito window, using an inbox you control:

1. **Sign up** via the website popup with the consent box **unticked** → confirm the
   form refuses to submit until you tick it. (Active consent ✓)
2. Tick it, submit → you get a **confirmation email**. You are **not** on the list yet.
   (Double opt-in ✓)
3. Click **Confirm** → you appear as **Confirmed** in Admin → Subscribers, with the
   consent source + date shown. (Recorded ✓)
4. Send yourself a **campaign** (Send email → test to your address) → open it and click
   **Unsubscribe** → you should land on the "You're unsubscribed" page.
   (Opt-out present + works ✓)
5. In Admin → Subscribers → Reload, you now show **Unsubscribed**. Send another test →
   it should be **skipped / suppressed**. (Suppression list ✓)
6. (Optional) Re-subscribe with the same email and confirm again → you should be able
   to receive email again. (Re-opt-in clears suppression ✓)

---

## 5. Housekeeping (not blocking)

- Add the **ICO registration number** to the Privacy page once it comes through
  (`pages/privacy.html`, `data-ico-number` placeholder). Businesses that do
  electronic marketing generally need to pay the ICO data-protection fee.
- Consider a periodic review of the suppression list and consent records (they're in
  D1 + KV; nothing to do routinely, but good governance).
