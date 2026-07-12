# Lumi Derm Architecture

**Updated:** 5 July 2026

**Production domain:** <https://lumidermaesthetics.com>

**Worker:** `lumiderm`

## Current architecture

```text
Browser
  |
  +-- lumidermaesthetics.com
  |     Cloudflare Worker Static Assets -> lumi-derm-website/
  |
  +-- Treatwell external booking link
  |     bookings, availability, payments and client records stay in Treatwell
  |
  +-- consent-controlled Google Maps iframe
  |
  +-- /admin/*
        Cloudflare Access
        static HTML/CSS/JS with browser-only website drafts
```

The repository currently has no application Worker entry point, D1 binding, R2 binding or
server-side admin API. Public booking uses the official Lumi Derm Treatwell widget supplied through
Treatwell Connect, with the official venue page retained as a fallback. The widget is loaded only
after the visitor allows external content or selects the one-time booking action.

## Target architecture

```text
Public visitor -> Worker-rendered website content with checked-in fallback
               -> Treatwell booking link or official widget
               -> consent-controlled Google Maps

Administrator -> Cloudflare Access -> /admin/ -> protected Worker API
                                            |-> D1 website content and audit log
                                            |-> R2 approved website media
                                            |-> Google Business Profile review sync

Treatwell Connect -> appointments, availability, payments, client records,
                     reminders, consultation forms and booking reviews
```

## Boundaries

| Capability | System of record | Website responsibility |
| --- | --- | --- |
| Appointments, availability and payments | Treatwell | Clear booking entry point and accurate explanatory copy |
| Booking clients, reminders and consultation forms | Treatwell | Do not duplicate client or clinical records |
| Public treatments, prices, offers and settings | D1 after content phases | Crawlable rendering with a checked-in fallback |
| Admin identity | Cloudflare Access | Verify Access identity server-side and fail closed |
| Approved website media | R2 after media phase | Validate files, consent evidence and alt text |
| Google reviews | Google Business Profile | Preserve source content and moderate display separately |
| Treatwell reviews | Treatwell | Use only an official widget/feed or approved manual evidence |
| Marketing recipients | Treatwell or another approved sender | Do not infer consent from a booking or copy client data casually |
| Clinical records | Treatwell/approved clinical process | Never store full clinical records in website content systems |

## Failure behaviour

Published SEO content must remain available in initial HTML. A D1 failure falls back to checked-in
content. Treatwell failure leaves telephone and email contact options available. Google Maps
failure leaves a normal directions link. Admin authentication and writes fail closed.

## Booking flow

```text
Visitor -> official Treatwell venue page/widget -> Treatwell confirmation
Treatwell -> booking/payment/client records remain in Treatwell
Website -> never receives card details or creates booking records
```

## Deliberately excluded

- a custom booking, payment or instalment engine;
- undocumented Treatwell API calls or scraping;
- duplicated Treatwell customer/appointment data;
- payment card or complete clinical record storage;
- invented business, clinical, legal, review or qualification data.
