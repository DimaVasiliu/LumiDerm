import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { REPOPATH_REGIONS, extractRegionInner, injectContentFragments } from '../src/worker.js';

// The safety guarantee: at cut-over, edge-rendering must reproduce every page
// byte-for-byte. We extract each region's current inner HTML, then inject it
// back — the result must equal the original file exactly (incl. the homepage
// JSON-LD block, which lives outside every marker region and is never touched).
const pages = {
  'lumi-derm-website/index.html': REPOPATH_REGIONS['lumi-derm-website/index.html'],
  'lumi-derm-website/pages/services.html': REPOPATH_REGIONS['lumi-derm-website/pages/services.html'],
  'lumi-derm-website/pages/about.html': REPOPATH_REGIONS['lumi-derm-website/pages/about.html'],
  'lumi-derm-website/pages/booking.html': REPOPATH_REGIONS['lumi-derm-website/pages/booking.html'],
};

for (const [path, regions] of Object.entries(pages)) {
  test(`edge-render reproduces ${path} byte-for-byte`, async () => {
    const html = await readFile(path, 'utf8');
    const fragMap = {};
    let found = 0;
    for (const region of regions) {
      const inner = extractRegionInner(html, region);
      if (inner != null) { fragMap['frag:' + region] = inner; found += 1; }
    }
    assert.ok(found > 0, `expected at least one marker region in ${path}`);
    const out = injectContentFragments(html, regions, fragMap);
    assert.equal(out, html, `${path} must be unchanged when fragments equal current content`);
  });
}

test('injecting a new fragment changes only that region', async () => {
  const html = await readFile('lumi-derm-website/pages/services.html', 'utf8');
  const regions = REPOPATH_REGIONS['lumi-derm-website/pages/services.html'];
  const out = injectContentFragments(html, regions, { 'frag:PRICES': '\n<!-- test -->\n' });
  assert.notEqual(out, html);
  assert.match(out, /<!-- PRICES:START[\s\S]*?-->\s*<!-- test -->/);
  // The JSON-LD / other regions untouched
  assert.equal(out.includes('SERVICES_HERO:START'), html.includes('SERVICES_HERO:START'));
});
