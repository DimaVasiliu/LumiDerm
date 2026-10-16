import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('admin offers publish binding has a matching control', async () => {
  const [html, js] = await Promise.all([
    readFile(new URL('../lumi-derm-website/admin/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../lumi-derm-website/admin/admin.js', import.meta.url), 'utf8'),
  ]);

  assert.match(js, /\[data-publish-offers\]/);
  assert.match(html, /data-publish-offers\b/);
});

test('opening admin preserves unpublished treatment drafts', async () => {
  const source = await readFile(new URL('../lumi-derm-website/admin/admin.js', import.meta.url), 'utf8');
  const load = source.slice(source.indexOf('async function loadPricesFromD1('), source.indexOf('\nfunction setPricesStatus('));
  const context = {
    state: { prices: { groups: [{ title: 'Unpublished price changes' }] } },
    renderPrices() {}, renderTreatmentCards() {},
    fetch() { throw new Error('Live reload must not overwrite drafts'); },
  };
  vm.createContext(context);
  vm.runInContext(load, context);
  await vm.runInContext('loadPricesFromD1(false, false)', context);
  assert.equal(context.state.prices.groups[0].title, 'Unpublished price changes');
  assert.match(source, /renderAll\(\);\s*loadReviews\(\);\s*loadPricesFromD1\(false, false\)/);
});

test('treatment routes invoke the Worker before static assets', async () => {
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const routes = config.match(/"run_worker_first":\s*\[([^\]]+)\]/)?.[1] || '';
  assert.match(routes, /"\/pages\/services"/);
  assert.match(routes, /"\/pages\/services\.html"/);
});
