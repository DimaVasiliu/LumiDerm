import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditSite } from '../scripts/check-site.mjs';

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'lumiderm-site-check-'));
  for (const [path, contents] of Object.entries(files)) {
    const file = join(root, path);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, contents);
  }
  return root;
}

test('accepts a valid static site', async () => {
  const root = await fixture({
    'index.html':
      '<!doctype html><html><body><h1 id="top">Home</h1><img src="image.png" alt=""><a href="page.html#details">Page</a></body></html>',
    'page.html': '<!doctype html><html><body><h1 id="details">Page</h1></body></html>',
    'image.png': 'not-a-real-image',
    'sitemap.xml':
      '<urlset><url><loc>https://lumidermaesthetics.com/</loc></url><url><loc>https://lumidermaesthetics.com/page.html</loc></url></urlset>',
  });

  const result = await auditSite({ siteRoot: root });
  assert.deepEqual(result.issues, []);
});

test('reports content and sitemap integrity failures', async () => {
  const root = await fixture({
    'index.html':
      '<!doctype html><html><body><h1 id="same">One</h1><h1 id="same">Two</h1><img src="missing.png"><a href="page.html#absent">Page</a></body></html>',
    'page.html':
      '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=/"><link rel="canonical" href="https://lumidermaesthetics.com/"></head><body><h1>Page</h1></body></html>',
    'sitemap.xml':
      '<urlset><url><loc>http://www.lumidermaesthetics.com/missing.html</loc></url><url><loc>https://lumidermaesthetics.com/page.html</loc></url></urlset>',
  });

  const result = await auditSite({ siteRoot: root });
  const codes = new Set(result.issues.map(({ code }) => code));
  assert.deepEqual(
    codes,
    new Set([
      'DUPLICATE_ID',
      'FRAGMENT_MISSING',
      'H1_COUNT',
      'IMAGE_ALT_MISSING',
      'LOCAL_TARGET_MISSING',
      'SITEMAP_TARGET_MISSING',
      'SITEMAP_CANONICAL_MISMATCH',
      'SITEMAP_REDIRECT',
      'SITEMAP_URL_INVALID',
    ]),
  );
});
