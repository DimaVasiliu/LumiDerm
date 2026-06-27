# Lumi Derm Aesthetics Platform Audit

Date: 15 June 2026

## Current Website State

The website is currently a static HTML/CSS/JavaScript site under `lumi-derm-website/`, with local image assets and no backend application.

Current booking flow is delegated to Treatwell:

- Main homepage CTAs link to `https://www.treatwell.co.uk/place/lumi-derm-aesthetics/`.
- `pages/booking.html` is a Treatwell landing page with a placeholder for a future Treatwell widget.
- There is no custom booking database, no Stripe integration, no user account system, no newsletter signup backend, and no admin dashboard.

Current data capture is minimal:

- Contact links use phone, email, Instagram, and Google Maps.
- There is no working form submission API.
- There is no consent capture for marketing emails.
- The policies page is still placeholder content and needs real privacy, cancellation, deposit, refund, treatment consent, and marketing consent wording before payments or customer data capture go live.

## Main Recommendation

Use Cloudflare for hosting and backend infrastructure, but do not use R2 as the customer database. Trigger Cloudflare

Recommended stack:

- Frontend hosting: Cloudflare Pages
- Backend APIs: Cloudflare Workers or Pages Functions
- Customer/payment metadata database: Cloudflare D1
- File storage: Cloudflare R2 only for images, exports, receipts, backups, or uploaded documents
- Payments: Stripe Checkout / Payment Links
- Instalments: Stripe-supported buy-now-pay-later methods such as Klarna or Clearpay, where eligible
- Transactional email: Cloudflare Email Service, Resend, Postmark, or SendGrid
- Marketing email/offers: Brevo, Mailchimp, Klaviyo, or similar email marketing platform
- Spam protection: Cloudflare Turnstile
- Admin access: Cloudflare Access protecting a lightweight admin dashboard

This keeps the system simple, low-maintenance, and scalable without building a large custom booking platform immediately.

## Cloudflare Product Fit

### Cloudflare Pages

Best fit for the public website. It can host the current static site and later add dynamic server-side functionality through Pages Functions.

### Cloudflare Workers / Pages Functions

Use for API endpoints:

- `POST /api/newsletter`
- `POST /api/contact`
- `POST /api/create-checkout-session`
- `POST /api/stripe-webhook`
- `POST /api/consent`

These endpoints should validate input, write to D1, call Stripe or email APIs, and return safe responses to the frontend.

### Cloudflare D1

Best Cloudflare option for the customer database because it is a relational SQL database. Use it for customers, consent records, Stripe IDs, payment records, enquiries, and webhook event logs.

### Cloudflare R2

R2 is object storage, not the right tool for customer records. Use it for files only:

- Treatment consent PDFs
- Exported CSV backups
- Before/after images if the client later uploads media
- Receipt or invoice archives if needed

### Cloudflare Email Service

Cloudflare now has Email Service for transactional sending and routing, but outbound sending is still marked beta in the docs. It is useful for confirmations, welcome emails, contact auto-replies, and operational notifications. It should not be treated as a full marketing campaign platform yet.

## Payments And Instalments

### Best first phase

Keep Treatwell for appointment booking and add Stripe only for:

- Deposits
- Treatment package purchases
- Gift vouchers
- Course prepayments
- Consultation fees

This avoids replacing Treatwell too early.

### Recommended payment integration

Use Stripe Checkout first, not a fully custom card form.

Reasons:

- Lower implementation complexity
- Better PCI posture because card details are handled by Stripe
- Supports many payment methods through Stripe
- Can save customer/payment metadata without storing card data locally
- Webhooks can update local payment status in D1

### Instalments

Do not build in-house instalments or credit logic.

Use Stripe-supported buy-now-pay-later methods:

- Klarna for eligible UK customers and services
- Clearpay where supported and eligible
- Stripe subscriptions or invoices only if the business wants structured courses or membership-style recurring payments

The business gets paid upfront for Klarna/Clearpay-style payments, while the payment provider handles customer instalments and repayment risk, subject to eligibility and provider rules.

## Customer Database Proposal

Use D1 with a minimal schema:

### `customers`

- `id`
- `email`
- `name`
- `phone`
- `stripe_customer_id`
- `marketing_consent`
- `consent_source`
- `consent_timestamp`
- `created_at`
- `updated_at`

### `consent_events`

- `id`
- `customer_id`
- `email`
- `consent_type`
- `status`
- `source`
- `ip_hash`
- `user_agent`
- `created_at`

### `payments`

- `id`
- `customer_id`
- `stripe_checkout_session_id`
- `stripe_payment_intent_id`
- `service_name`
- `amount`
- `currency`
- `status`
- `created_at`

### `enquiries`

- `id`
- `customer_id`
- `name`
- `email`
- `phone`
- `service_interest`
- `message`
- `source`
- `created_at`

### `webhook_events`

- `id`
- `provider`
- `event_id`
- `event_type`
- `processed_at`

The webhook table is important so Stripe webhooks are processed once only.

## Email Marketing Recommendation

Separate transactional email from marketing email.

Transactional emails:

- Payment confirmations
- Consultation request confirmations
- Aftercare instructions
- Appointment preparation notes

Marketing emails:

- Monthly offers
- Seasonal campaigns
- Treatment education
- Rebooking prompts
- Birthday or loyalty offers

For marketing, use a real marketing platform such as Brevo, Mailchimp, Klaviyo, or Loops. Cloudflare can trigger API calls into that platform, but it should not be the newsletter campaign UI.

For UK email marketing, capture explicit consent unless relying on the limited existing-customer soft opt-in. Every marketing email needs a clear unsubscribe path, and opt-outs should be stored.

## Security And Compliance Requirements

Before launching payments or customer capture:

- Add a real privacy policy.
- Add payment, refund, cancellation, deposit, no-show, and treatment suitability terms.
- Add a marketing consent checkbox that is unchecked by default.
- Add unsubscribe handling.
- Store consent evidence.
- Do not store card details.
- Verify Stripe webhook signatures.
- Add rate limiting and Cloudflare Turnstile to public forms.
- Keep customer data minimal.
- Protect any admin dashboard with Cloudflare Access.
- Add a process for deleting/exporting customer data on request.

This is not legal advice, but the site should be treated as handling personal data once email capture goes live.

## Cloudflare vs AWS

Cloudflare is the better fit for the next version.

Reasons:

- The current site is static and can move cleanly to Cloudflare Pages.
- Workers and Pages Functions are enough for the API layer.
- D1 is enough for customer/payment metadata at this scale.
- R2 can handle files and backups later.
- Cloudflare keeps hosting, DNS, security, forms, and edge APIs in one place.

AWS would only be worth considering if Lumi Derm later needs:

- A large custom booking system
- Heavy reporting
- Complex staff scheduling
- High-volume medical records workflows
- A full Postgres-backed app
- Enterprise CRM/data warehouse needs

For this business stage, AWS would add avoidable complexity.

## Suggested Build Roadmap

### Phase 1: Foundation

- Move production hosting to Cloudflare Pages.
- Set up the real domain and redirects.
- Add privacy, payment, cancellation, and marketing consent policies.
- Add Cloudflare Turnstile to forms.

### Phase 2: Customer Capture

- Add newsletter/contact API with Workers.
- Store customers and consent in D1.
- Sync marketing subscribers to Brevo/Mailchimp/Klaviyo.
- Add double opt-in if the marketing platform supports it.

### Phase 3: Payments

- Add Stripe Checkout for deposits, packages, vouchers, or consultation fees.
- Store Stripe customer IDs and payment status in D1.
- Add Stripe webhook handling.
- Send transactional payment confirmation emails.

### Phase 4: Instalments

- Enable eligible Stripe payment methods such as Klarna/Clearpay.
- Add clear wording that instalment availability is subject to provider approval.
- Consider course/package products instead of per-treatment instalment logic.

### Phase 5: Admin And Automation

- Add a small Cloudflare Access-protected admin dashboard.
- View customers, consent status, payment history, and enquiries.
- Trigger aftercare emails.
- Export CSV reports.
- Add review request automation after appointments.

## Extra Product Ideas

- Gift voucher purchase flow.
- Treatment package pages with deposit buttons.
- Consultation quiz that recommends suitable treatment categories.
- Aftercare email sequences by treatment type.
- Rebooking reminder emails.
- Birthday/monthly offer campaigns.
- VIP loyalty list.
- Review request automation linking back to Treatwell.
- Downloadable pre-treatment and aftercare guides.
- Admin-only customer notes, but only after proper privacy policy and access controls are in place.

## Source Notes

- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Cloudflare Email Service: https://developers.cloudflare.com/email-service/
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe Payment Methods: https://docs.stripe.com/payments/payment-methods
- Stripe Klarna: https://docs.stripe.com/payments/klarna
- Stripe Afterpay/Clearpay: https://docs.stripe.com/payments/afterpay-clearpay
- ICO electronic mail marketing guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
