# Lumi Derm Aesthetic Website

Premium static first draft for Lumi Derm Aesthetic, built with semantic HTML5, modern CSS, and vanilla JavaScript.

## Project Structure

```text
lumi-derm-website/
  assets/
    images/      Local WebP placeholder visuals
    icons/       Local brand/icon assets
    data/        Local JSON feeds, including reviews
  css/
    style.css    Mobile-first global styles and components
    responsive.css
  js/
    main.js      Navigation, scroll state, reveal animations, FAQ accordion
  pages/
    services.html
    treatment.html
    booking.html
    gallery.html
    about.html
    contact.html
    policies.html
  index.html
  robots.txt
  sitemap.xml
  README.md
```

## Run Locally

Open `index.html` directly in a browser, or serve the folder with any static server:

```bash
cd lumi-derm-website
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Current Features

- Mobile-first premium homepage
- Sticky transparent header with mobile menu
- Local generated WebP image placeholders
- Featured services, brand story, process timeline, gallery preview, reviews, FAQ, and contact preview
- Reviews render from `assets/data/reviews.json` when served over HTTP, with crawlable HTML fallback
- Starter internal pages with SEO titles and meta descriptions
- Internal consultation landing page and controlled booking CTAs
- Accessible FAQ accordion and keyboard focus states
- Reduced-motion support
- JSON-LD BeautySalon schema placeholder
- `robots.txt` and `sitemap.xml` placeholders

## Future Features

- Deploy on Cloudflare Pages
- Add an approved booking widget or Cloudflare Worker booking flow later
- Add a Cloudflare Worker scheduled reviews sync:
  - Google reviews: use the official Google Business Profile API for the verified Lumi Derm location.
  - Booking-platform reviews: use an approved partner export, feed, or widget if provided. Do not scrape pages.
  - Store normalized reviews in D1 or KV, then publish a cached JSON file/API consumed by the homepage.
- Add CMS/admin editing later for treatments, pricing, gallery, reviews, and policies
- Replace placeholders with final photography, approved before-and-after images, and verified clinic details
