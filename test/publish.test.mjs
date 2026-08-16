import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import worker from '../src/worker.js';

const ownerHeaders = { 'cf-access-authenticated-user-email': 'owner@example.com' };

function env() {
  return {
    ADMIN_EMAILS: 'owner@example.com',
    GITHUB_TOKEN: 'test_token',
    GITHUB_REPO: 'lumi/site',
    GITHUB_BRANCH: 'main',
  };
}

function req(body) {
  return new Request('https://lumidermaesthetics.com/admin/api/publish', {
    method: 'POST',
    headers: { ...ownerHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const sha = (s) => createHash('sha256').update(s).digest('base64');

// A tiny GitHub API mock that records the tree it's asked to create.
function mockGitHub({ currentIndex, currentHeaders }) {
  const recorded = { tree: null, commitMessage: null, refUpdated: false };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    const ok = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

    if (u.includes('/contents/lumi-derm-website/index.html')) return ok({ content: b64(currentIndex) });
    if (u.includes('/contents/lumi-derm-website/_headers')) return ok({ content: b64(currentHeaders) });
    if (u.includes('/git/ref/heads/main')) return ok({ object: { sha: 'BASE_SHA' } });
    if (u.includes('/git/commits/BASE_SHA')) return ok({ tree: { sha: 'BASE_TREE' } });
    if (u.endsWith('/git/trees')) { recorded.tree = body.tree; return ok({ sha: 'NEW_TREE' }); }
    if (u.endsWith('/git/commits')) { recorded.commitMessage = body.message; return ok({ sha: 'NEW_COMMIT' }); }
    if (u.includes('/git/refs/heads/main')) { recorded.refUpdated = true; return ok({ ref: 'refs/heads/main' }); }
    return ok({}, 404);
  };
  return { recorded, restore: () => { globalThis.fetch = original; } };
}

test('atomic publish rejects requests with no files', async () => {
  const res = await worker.fetch(req({ files: [] }), env());
  assert.equal(res.status, 400);
});

test('atomic publish rejects disallowed file paths', async () => {
  const res = await worker.fetch(req({ files: [{ path: 'src/worker.js', content: 'x' }] }), env());
  assert.equal(res.status, 403);
});

test('atomic publish commits everything in one commit', async () => {
  const gh = mockGitHub({ currentIndex: '<html></html>', currentHeaders: 'x' });
  try {
    const res = await worker.fetch(
      req({ message: 'test', files: [{ path: 'lumi-derm-website/assets/data/content.json', content: '{}\n' }] }),
      env(),
    );
    assert.equal(res.status, 200);
    const p = await res.json();
    assert.equal(p.ok, true);
    assert.equal(p.commit, 'NEW_COMMIT');
    // Exactly one tree => one commit, containing our single file.
    assert.equal(gh.recorded.tree.length, 1);
    assert.equal(gh.recorded.tree[0].path, 'lumi-derm-website/assets/data/content.json');
    assert.ok(gh.recorded.refUpdated);
  } finally {
    gh.restore();
  }
});

test('publishing index.html auto-syncs the CSP hash in _headers', async () => {
  const oldJsonLd = '{"@type":"BeautySalon","telephone":"07832839298"}';
  const newJsonLd = '{"@type":"BeautySalon","telephone":"01234567890"}';
  const wrap = (j) => `<!doctype html><script type="application/ld+json">${j}</script>`;
  const currentIndex = wrap(oldJsonLd);
  const newIndex = wrap(newJsonLd);
  const oldHash = sha(oldJsonLd);
  const currentHeaders = `/*\n  Content-Security-Policy: script-src 'self' 'sha256-${oldHash}'\n`;

  const gh = mockGitHub({ currentIndex, currentHeaders });
  try {
    const res = await worker.fetch(
      req({ files: [{ path: 'lumi-derm-website/index.html', content: newIndex }] }),
      env(),
    );
    assert.equal(res.status, 200);
    // The tree must now include BOTH index.html and a patched _headers.
    const paths = gh.recorded.tree.map((t) => t.path);
    assert.ok(paths.includes('lumi-derm-website/index.html'));
    assert.ok(paths.includes('lumi-derm-website/_headers'), '_headers should be added to keep CSP in sync');
    const headersEntry = gh.recorded.tree.find((t) => t.path === 'lumi-derm-website/_headers');
    const newHash = sha(newJsonLd);
    assert.ok(headersEntry.content.includes(`'sha256-${newHash}'`), 'new JSON-LD hash present');
    assert.ok(!headersEntry.content.includes(`'sha256-${oldHash}'`), 'old hash replaced');
  } finally {
    gh.restore();
  }
});
