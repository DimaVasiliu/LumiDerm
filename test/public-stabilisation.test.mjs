import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const site = 'lumi-derm-website';
const publicPages = [
  'index.html',
  '404.html',
  'pages/about.html',
  'pages/booking.html',
  'pages/cookies.html',
  'pages/gallery.html',
  'pages/policies.html',
  'pages/privacy.html',
  'pages/services.html',
  'pages/terms.html',
];

async function allHtmlPages() {
  const pages = ['index.html', '404.html'];
  const entries = await readdir(`${site}/pages`);
  entries
    .filter((name) => name.endsWith('.html'))
    .sort()
    .forEach((name) => pages.push(`pages/${name}`));
  return pages;
}

test('public pages expose consistent keyboard navigation landmarks', async () => {
  for (const page of publicPages) {
    const html = await readFile(`${site}/${page}`, 'utf8');
    assert.match(html, /<a class="skip-link" href="#main-content">/);
    assert.match(html, /<main\b[^>]*id="main-content"/);
    assert.match(html, /<nav\b[^>]*aria-label="Primary navigation"/);
    assert.match(html, /data-cookie-settings/);
  }
});

test('Treatwell and Google embeds wait for consent and retain external fallbacks', async () => {
  const home = await readFile(`${site}/index.html`, 'utf8');
  const booking = await readFile(`${site}/pages/booking.html`, 'utf8');
  assert.doesNotMatch(home, /<iframe\b[^>]*\bsrc=/i);
  assert.match(home, /data-consent-embed/);
  assert.match(home, /data-load-consent-embed/);
  assert.doesNotMatch(booking, /<script\b[^>]*widget\.treatwell/i);
  assert.match(booking, /data-provider="treatwell"/);
  assert.match(
    booking,
    /data-widget-script="https:\/\/widget\.treatwell\.co\.uk\/common\/venue-menu\/javascript\/widget-button\.js\?v1"/,
  );
  assert.match(
    booking,
    /data-widget-url="https:\/\/widget\.treatwell\.co\.uk\/place\/523733\/menu\/"/,
  );
  assert.match(
    booking,
    /href="https:\/\/www\.treatwell\.co\.uk\/place\/lumi-derm-aesthetics\/"/,
  );
});

test('public pages use one style.css cache key and defer main.js', async () => {
  const versions = new Set();
  for (const page of await allHtmlPages()) {
    const html = await readFile(`${site}/${page}`, 'utf8');
    for (const match of html.matchAll(/href="(?:\.\.\/)?css\/style\.css\?v=([^"]+)"/g)) {
      versions.add(match[1]);
    }
    for (const match of html.matchAll(/<script\b[^>]*src="(?:\.\.\/)?js\/main\.js\?v=[^"]+"[^>]*><\/script>/g)) {
      assert.match(match[0], /\bdefer\b/, `${page} must defer main.js`);
    }
  }
  assert.deepEqual([...versions], ['20260909-frontfix1']);
});

test('review star picker exposes valid radio semantics', async () => {
  const home = await readFile(`${site}/index.html`, 'utf8');
  const group = home.match(/<div class="review-stars-input"[^>]*role="radiogroup"[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(group, 'review stars radiogroup must exist');
  const radios = [...group.matchAll(/<button\b[^>]*class="review-star"[^>]*>/g)].map((m) => m[0]);
  assert.equal(radios.length, 5);
  assert.equal(radios.filter((tag) => /\brole="radio"/.test(tag)).length, 5);
  assert.equal(radios.filter((tag) => /\baria-checked="false"/.test(tag)).length, 5);
  assert.equal(radios.filter((tag) => /\btabindex="0"/.test(tag)).length, 1);
});

test('review summary is derived from the records in the feed', async () => {
  const data = JSON.parse(await readFile(`${site}/assets/data/reviews.json`, 'utf8'));
  // summary.count is the real public Treatwell count; the feed is a curated subset,
  // so the displayed count is at least the number of records we ship (see summary.note).
  assert.ok(
    Number.isInteger(data.summary.count) && data.summary.count >= data.reviews.length,
    `summary.count (${data.summary.count}) must be an integer >= feed size (${data.reviews.length})`,
  );
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
  assert.equal([...sitemap.matchAll(/<url>/g)].length, 11);
  assert.equal([...sitemap.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].length, 11);
});

test('security policy allows only the retained script sources and matches JSON-LD', async () => {
  const headers = await readFile(`${site}/_headers`, 'utf8');
  const home = await readFile(`${site}/index.html`, 'utf8');
  const scriptDirective = headers.match(/script-src[^;]+;/)?.[0] || '';
  assert.match(scriptDirective, /script-src 'self'/);
  assert.match(scriptDirective, /'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(scriptDirective, /https:\/\/widget\.treatwell\.co\.uk/);
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

test('deployment config keeps website and email domains intentionally split', async () => {
  const wrangler = await readFile('wrangler.jsonc', 'utf8');
  assert.match(wrangler, /"SITE_ORIGIN": "https:\/\/lumidermaesthetics\.com"/);
  assert.match(wrangler, /"FROM_EMAIL": "Lumi Derm Aesthetics <info@lumidermaesthetics\.com>"/);
  assert.match(wrangler, /"REPLY_TO": "info@lumidermaesthetics\.co\.uk"/);
  assert.match(wrangler, /"CONTACT_EMAIL": "info@lumidermaesthetics\.co\.uk"/);
  assert.doesNotMatch(wrangler, /hello@lumidermaesthetics\.com/);
});
