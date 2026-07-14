# Lumi Derm — Email marketing

**Decision: use Treatwell Connect's built-in email tool.** Her clients and their marketing consent already live there, it handles unsubscribes, and it's GDPR-compliant. We are not building an email sender — that would mean owning consent records, unsubscribe suppression, bounce handling and domain reputation (SPF/DKIM/DMARC), with real legal exposure and no benefit.

**No AWS SES needed. No code. No monthly cost.**

---

## STEP 0 — Check consent first. Do this before sending anything.

This is the one thing that can actually get her in trouble.

In **Treatwell Connect → Clients**, each client has a **marketing communication** tick. She may **only** email the ones where it's ticked.

Ask her to check:

- How many clients have the marketing tick? (That's her real audience — it may be far smaller than her total client count.)
- Were clients ever *asked*? If she's never asked, most won't be ticked.

**If almost nobody is ticked**, do not "just send anyway". Instead:

1. Start asking at every appointment: *"Would you like to hear about our offers by email?"* — tick it in Connect.
2. Add a newsletter signup to the website (I can build this — say the word).
3. Grow the list properly. A small consented list beats a big illegal one.

### The rules, briefly (UK GDPR / PECR)

- **Soft opt-in:** she *may* email **existing clients** about **similar treatments** — provided they were given a chance to opt out when their details were collected, and every email has an unsubscribe link.
- **Never** email people who have not booked and have not opted in.
- **Every email must have a working unsubscribe.** Treatwell does this automatically — one more reason to use it.
- Honour unsubscribes immediately and permanently.
- She likely needs to pay the **ICO data protection fee** (~£52/yr) — run the ICO self-assessment.

> Not legal advice. If in doubt, keep it to consented clients only.

---

## STEP 1 — Sending a campaign in Treatwell Connect

Broad flow (exact menu labels may differ slightly — follow the in-app wording):

1. **Connect → Marketing** (the bulk email tool)
2. **Filter the client list** — choose who gets it (e.g. clients who had laser; clients not seen in 3+ months). Consent is respected automatically.
3. **Write the email** — subject line + body. Use a template below.
4. **Send a test to herself first.** Always. Check it on a phone.
5. **Send**, then check opens/clicks after a couple of days.

### Sensible rules of thumb

- **Frequency:** once or twice a month, maximum. Over-emailing kills a list faster than anything.
- **Best times:** Tue–Thu, late morning or early evening.
- **One idea per email.** One offer, one button.
- **Subject lines:** short, specific, no ALL CAPS, no "!!!", no "FREE" — that's a spam-filter magnet.

---

# Ready-to-send campaigns

Copy/paste and adjust. Replace `[Name]` with Connect's personalisation field. **Keep the booking link pointing at the site**, so they land on the treatment:

`https://lumidermaesthetics.com/pages/booking.html`

---

## 1. New client offer — 15% off first visit

**Subject:** Your first treatment at Lumi Derm — 15% off
**Preview:** A calm, consultation-led start to your skin plan.

> Hi [Name],
>
> If you've been meaning to book, this is a lovely moment to start.
>
> **15% off your first single-session treatment** — laser, skin, body or beauty, whichever is right for you.
>
> Every treatment starts with a proper consultation, so we build a plan around your skin and your goals rather than selling you a package you don't need.
>
> **Book your consultation →** https://lumidermaesthetics.com/pages/booking.html
>
> Offer ends 31 August. See you soon,
> Iulia — Lumi Derm Aesthetics, London Docklands

---

## 2. Seasonal — Summer glow facial

**Subject:** The Fire & Ice facial — £90
**Preview:** Instant radiance, no downtime.

> Hi [Name],
>
> Our most-loved facial is back for the season.
>
> **Fire & Ice by iS Clinical + LED light therapy — £90.** It's the one people book before a wedding, a holiday or a big night. Resurfacing, calming, and you leave glowing with essentially no downtime.
>
> **Book your facial →** https://lumidermaesthetics.com/pages/booking.html
>
> Available until 30 September.
>
> Iulia — Lumi Derm Aesthetics

---

## 3. Laser course — bundle and save

**Subject:** Bundle your laser areas, save up to 30%
**Preview:** Fewer sessions, better price, same expert care.

> Hi [Name],
>
> If you're treating more than one area, you shouldn't be paying full price for each.
>
> **Combine 2–5 laser areas and save from 15% up to 30%** across your course. Laser hair removal works in cycles, so a course is how you get lasting results anyway — the bundle just makes it cost less.
>
> We'll map out exactly which areas and how many sessions at your consultation. No guesswork.
>
> **Plan your course →** https://lumidermaesthetics.com/pages/booking.html
>
> Iulia — Lumi Derm Aesthetics

---

## 4. Win-back — haven't seen you in a while

**Send to:** clients not seen in 3+ months. This is usually the highest-earning email you can send.

**Subject:** It's been a while, [Name]
**Preview:** Your skin plan is still here when you're ready.

> Hi [Name],
>
> It's been a few months since your last visit — no pressure at all, but if you'd like to pick your plan back up, we're here.
>
> Skin changes with the seasons, so if things feel different to last time, that's normal. Come in for a consultation and we'll reassess properly rather than carrying on from where we left off.
>
> **Book a consultation →** https://lumidermaesthetics.com/pages/booking.html
>
> Lovely to hear from you either way,
> Iulia — Lumi Derm Aesthetics

---

## 5. Refer a friend

**Subject:** You both get 10% off
**Preview:** A thank you for sending someone our way.

> Hi [Name],
>
> Most of our new clients come from someone they trust — which is the nicest compliment we could get.
>
> **Refer a friend and you'll each get 10% off your next treatment.** Just ask them to mention your name when they book.
>
> **Share the clinic →** https://lumidermaesthetics.com
>
> Thank you,
> Iulia — Lumi Derm Aesthetics

---

## 6. Birthday

**Subject:** Happy birthday, [Name] 🎂
**Preview:** A little something from us.

> Hi [Name],
>
> Happy birthday from all of us at Lumi Derm.
>
> Treat yourself this month — **[insert her birthday offer, e.g. 15% off any facial]**, valid for the next 30 days.
>
> **Book your treat →** https://lumidermaesthetics.com/pages/booking.html
>
> Have a wonderful day,
> Iulia — Lumi Derm Aesthetics

---

## 7. Aftercare / rebook nudge

**Send to:** clients mid-course. Keeps courses on schedule, which is what actually drives revenue.

**Subject:** Time for your next session
**Preview:** Keeping your course on track.

> Hi [Name],
>
> A quick reminder that your next session is due soon. Laser and skin courses work best when the sessions stay spaced correctly — leaving a long gap means losing some of the progress you've already paid for.
>
> **Book your next session →** https://lumidermaesthetics.com/pages/booking.html
>
> Any questions before you come in, just reply to this email.
>
> Iulia — Lumi Derm Aesthetics

---

## Writing rules — keep the brand intact

**Do:**
- Warm, calm, expert. Same voice as the website.
- One offer, one clear button.
- Be specific: "£90", "save up to 30%", "ends 30 September".
- Always mention consultation-led care — it's the differentiator.

**Don't:**
- Promise medical results ("removes wrinkles", "permanent after 1 session"). Say "reduces the appearance of", "most clients need a course".
- Use before/after photos without **written** client consent.
- Use urgency gimmicks ("LAST CHANCE!!!"). It cheapens a premium clinic.
- Email people who never consented.

---

## If she outgrows Treatwell's tool

If she wants proper drag-and-drop templates and richer branding, move to **Brevo** or **MailerLite** (both have free tiers and handle unsubscribes/bounces). She'd export her **consented** clients from Connect and import them there. Tell me and I'll set it up and build branded templates.

Sources:
- Treatwell — sending emails with Connect's marketing tool: https://partnercare.treatwell.com/s/article/How-to-send-emails-to-your-clients-with-Connect-s-marketing-tool?language=en_GB
- Treatwell — exporting your client list: https://partnercare.treatwell.com/s/article/How-do-I-export-my-client-list?language=en_GB
- Treatwell — adding clients (and the marketing-consent tick): https://partnercare.treatwell.com/s/?language=en_GB&view=article&path=How-do-I-add-my-clients-to-Connect
- ICO data protection fee: https://ico.org.uk/for-organisations/data-protection-fee/
