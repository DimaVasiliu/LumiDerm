import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const site = 'lumi-derm-website';
const publicPages = [
  'index.html',
  '404.html',
  'pages/about.html',
  'pages/booking.html',
  'pages/contact.html',
  'pages/cookies.html',
  'pages/gallery.html',
  'pages/policies.html',
  'pages/privacy.html',
  'pages/services.html',
  'pages/terms.html',
];

test('public pages expose consistent keyboard navigation landmarks', async () => {
  for (const page of publicPages) {
    const html = await readFile(`${site}/${page}`, 'utf8');
    assert.match(html, /<a class="skip-link" href="#main-content">/);
    assert.match(html, /<main\b[^>]*id="main-content"/);
    assert.match(html, /<nav\b[^>]*aria-label="Primary navigation"/);
    assert.match(html, /data-cookie-settings/);
  }
});

test('Square and Google embeds have no network-loading src before consent', async () => {
  const home = await readFile(`${site}/index.html`, 'utf8');
  const booking = await readFile(`${site}/pages/booking.html`, 'utf8');
  for (const html of [home, booking]) {
    assert.doesNotMatch(html, /<iframe\b[^>]*\bsrc=/i);
    assert.match(html, /data-consent-embed/);
    assert.match(html, /data-load-consent-embed/);
  }
});

test('review summary is derived from the records in the feed', async () => {
  const data = JSON.parse(await readFile(`${site}/assets/data/reviews.json`, 'utf8'));
  assert.equal(data.summary.count, data.reviews.length);
  const average =
    data.reviews.reduce((sum, review) => sum + review.rating, 0) / data.reviews.length;
  assert.equal(data.summary.rating, average.toFixed(1));
});

test('sitemap and robots use canonical, indexable routes', async () => {
  const sitemap = await readFile(`${site}/sitemap.xml`, 'utf8');
  const robots = await readFile(`${site}/robots.txt`, 'utf8');
  assert.match(robots, /Sitemap: https:\/\/lumidermaesthetics\.com\/sitemap\.xml/);
  assert.doesNotMatch(robots, /www\.lumidermaesthetics\.com/);
  assert.doesNotMatch(sitemap, /pages\/treatment\.html/);
  assert.equal([...sitemap.matchAll(/<url>/g)].length, 10);
  assert.equal([...sitemap.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].length, 10);
});

test('security policy allows only the retained script sources and matches JSON-LD', async () => {
  const headers = await readFile(`${site}/_headers`, 'utf8');
  const home = await readFile(`${site}/index.html`, 'utf8');
  const scriptDirective = headers.match(/script-src[^;]+;/)?.[0] || '';
  assert.match(scriptDirective, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(scriptDirective, /'unsafe-inline'/);
  assert.doesNotMatch(home, /cdn\.jsdelivr\.net\/npm\/gsap/);
  const jsonLd = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(jsonLd);
  const hash = createHash('sha256').update(jsonLd).digest('base64');
  assert.match(scriptDirective, new RegExp(`'sha256-${hash.replaceAll('+', '\\+')}'`));
});

test('custom 404 and cache policy are configured for Workers static assets', async () => {
  const wrangler = await readFile('wrangler.jsonc', 'utf8');
  const headers = await readFile(`${site}/_headers`, 'utf8');
  assert.match(wrangler, /"not_found_handling": "404-page"/);
  assert.match(headers, /\/css\/\*[\s\S]*max-age=31536000, immutable/);
  assert.match(headers, /\/assets\/data\/\*[\s\S]*max-age=0, must-revalidate/);
});
