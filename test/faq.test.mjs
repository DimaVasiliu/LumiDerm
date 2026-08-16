import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const site = 'lumi-derm-website';

// Load the browser-only content-template.js into a fake window so we can call
// the same renderers the admin uses at publish time.
async function loadTemplates() {
  const src = await readFile(`${site}/admin/content-template.js`, 'utf8');
  const win = {};
  vm.runInNewContext(src, { window: win, module: undefined });
  return win;
}

const FAQ_LIST_MARKERS = /(<!-- FAQ:START[\s\S]*?-->)[\s\S]*?(<!-- FAQ:END -->)/;
const FAQ_JSONLD_RE = /\{\s*"@type":\s*"FAQPage"[\s\S]*?\}(?=\s*\]\s*\}\s*<\/script>)/;
const JSONLD_BLOCK_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

test('content.json FAQ matches the homepage accordion count', async () => {
  const content = JSON.parse(await readFile(`${site}/assets/data/content.json`, 'utf8'));
  const home = await readFile(`${site}/index.html`, 'utf8');
  assert.ok(Array.isArray(content.faq) && content.faq.length > 0, 'content.faq must be a non-empty array');
  const visibleRows = [...home.matchAll(/class="faq-q-text"/g)].length;
  const jsonLdQuestions = [...home.matchAll(/"@type":\s*"Question"/g)].length;
  assert.equal(visibleRows, content.faq.length, 'visible FAQ rows must equal content.faq length');
  assert.equal(jsonLdQuestions, content.faq.length, 'FAQPage questions must equal content.faq length');
});

test('homepage carries editable FAQ markers', async () => {
  const home = await readFile(`${site}/index.html`, 'utf8');
  assert.match(home, FAQ_LIST_MARKERS, 'FAQ:START/END markers must be present');
  assert.match(home, FAQ_JSONLD_RE, 'FAQPage object must be locatable for republishing');
});

test('renderers reproduce the current homepage FAQ byte-for-byte', async () => {
  const win = await loadTemplates();
  const content = JSON.parse(await readFile(`${site}/assets/data/content.json`, 'utf8'));
  const home = await readFile(`${site}/index.html`, 'utf8');

  const rows = win.renderFaqRows(content.faq);
  const withRows = home.replace(FAQ_LIST_MARKERS, (m, p1, p2) => p1 + '\n' + rows + '\n              ' + p2);
  assert.equal(withRows, home, 'renderFaqRows must reproduce the visible accordion');

  const withLd = withRows.replace(FAQ_JSONLD_RE, () => win.renderFaqJsonLd(content.faq));
  assert.equal(withLd, home, 'renderFaqJsonLd must reproduce the FAQPage structured data');
});

test('a FAQ edit keeps valid JSON-LD and a recomputable CSP hash', async () => {
  const win = await loadTemplates();
  const content = JSON.parse(await readFile(`${site}/assets/data/content.json`, 'utf8'));
  const home = await readFile(`${site}/index.html`, 'utf8');
  const headers = await readFile(`${site}/_headers`, 'utf8');

  // Simulate the admin publish: add a question, rewrite rows + JSON-LD.
  const edited = content.faq.concat([{ q: 'Do you offer packages?', a: '<p>Yes — ask at your <a href="pages/booking.html">consultation</a>.</p>' }]);
  const rows = win.renderFaqRows(edited);
  let out = home.replace(FAQ_LIST_MARKERS, (m, p1, p2) => p1 + '\n' + rows + '\n              ' + p2);
  out = out.replace(FAQ_JSONLD_RE, () => win.renderFaqJsonLd(edited));

  const jsonLd = out.match(JSONLD_BLOCK_RE)[1];
  JSON.parse(jsonLd); // must stay valid JSON
  assert.equal([...out.matchAll(/"@type":\s*"Question"/g)].length, edited.length);
  assert.equal([...out.matchAll(/class="faq-q-text"/g)].length, edited.length);

  // The publish swaps the old JSON-LD hash for the new one in _headers.
  const oldLd = home.match(JSONLD_BLOCK_RE)[1];
  const oldHash = createHash('sha256').update(oldLd).digest('base64');
  const newHash = createHash('sha256').update(jsonLd).digest('base64');
  assert.ok(headers.includes(`'sha256-${oldHash}'`), 'current _headers must contain the live JSON-LD hash');
  const newHeaders = headers.replace(`'sha256-${oldHash}'`, `'sha256-${newHash}'`);
  const scriptDirective = newHeaders.match(/script-src[^;]+;/)[0];
  assert.match(scriptDirective, new RegExp(`'sha256-${newHash.replaceAll('+', '\\+')}'`));
});

test('answers with block tags become spaced plain text in structured data', async () => {
  const win = await loadTemplates();
  const ld = win.renderFaqJsonLd([{ q: 'Q', a: '<p>First part.</p><p>Second part.</p>' }]);
  const parsed = JSON.parse('{"@type":"FAQPage","mainEntity":[' +
    ld.slice(ld.indexOf('[') + 1, ld.lastIndexOf(']')) + ']}');
  assert.equal(parsed.mainEntity[0].acceptedAnswer.text, 'First part. Second part.');
});
