import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/worker.js';

const ownerHeaders = { 'cf-access-authenticated-user-email': 'owner@example.com' };
const jsonHeaders = { 'content-type': 'application/json' };

function req(path, options = {}) {
  return new Request('https://lumidermaesthetics.com' + path, { ...options, headers: { ...(options.headers || {}) } });
}
const readJson = (res) => res.json();
const FUTURE = '2099-12-31';
const PAST = '2000-01-01';

// Minimal D1 mock for the offers table + revisions.
class MockD1 {
  constructor(seed = []) {
    this.offers = seed.map((o, i) => ({ id: i + 1, sort_order: i, featured: 0, status: 'live', expires: '', ...o }));
    this.revisions = [];
    this._nextId = this.offers.length + 1;
    this.throwOnOffers = false;
  }
  prepare(sql) {
    const db = this;
    const make = (args) => ({
      sql, args,
      bind: (...a) => make(a), // fresh bound statement, like real D1
      first: async () => db._first(sql, args),
      all: async () => ({ results: db._all(sql, args) }),
      run: async () => db._run(sql, args),
    });
    return make([]);
  }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await this._run(s.sql, s.args)); return out; }
  _first(sql, args = []) {
    if (/COUNT\(\*\) AS c FROM offers/.test(sql)) { if (this.throwOnOffers) throw new Error('no table'); return { c: this.offers.length }; }
    if (/created_at FROM revisions WHERE kind='offers'/.test(sql)) { const r = this.revisions.at(-1); return r ? { created_at: r.created_at } : null; }
    if (/SELECT id FROM offers WHERE status='live' AND lower\(title\)/.test(sql)) {
      const title = String(args[0] || '').toLowerCase(); const excl = args[1];
      const m = this.offers.find((o) => o.status === 'live' && String(o.title || '').toLowerCase() === title && o.id !== excl);
      return m ? { id: m.id } : null;
    }
    if (/MAX\(sort_order\) AS m FROM offers/.test(sql)) {
      return { m: this.offers.length ? this.offers.reduce((a, o) => Math.max(a, o.sort_order ?? 0), -1) : null };
    }
    return null;
  }
  _all(sql, args) {
    if (/FROM offers WHERE status='live'/.test(sql)) {
      if (this.throwOnOffers) throw new Error('no table');
      const today = args[0];
      return this.offers
        .filter((o) => o.status === 'live' && (!o.expires || o.expires >= today))
        .sort((a, b) => (b.featured - a.featured) || (a.sort_order - b.sort_order));
    }
    if (/FROM offers ORDER BY sort_order/.test(sql)) { if (this.throwOnOffers) throw new Error('no table'); return this.offers; }
    return [];
  }
  _run(sql, args) {
    if (/DELETE FROM offers WHERE id/.test(sql)) {
      const before = this.offers.length; this.offers = this.offers.filter((o) => o.id !== args[0]);
      return { meta: { changes: before - this.offers.length } };
    }
    if (/DELETE FROM offers/.test(sql)) { this.offers = []; return { meta: { changes: 1 } }; }
    if (/UPDATE offers SET title/.test(sql)) {
      const id = args[13]; const o = this.offers.find((x) => x.id === id);
      if (o) Object.assign(o, { title: args[0], category: args[1], description: args[2], price: args[3], badge: args[4], image: args[5], alt: args[6], service: args[7], status: args[8], featured: args[9], expires: args[10], note: args[11] });
      return { meta: { changes: o ? 1 : 0 } };
    }
    if (/INSERT INTO offers/.test(sql)) {
      const [title, category, description, price, badge, image, alt, service, status, featured, expires, note, sort_order] = args;
      const id = this._nextId++;
      this.offers.push({ id, title, category, description, price, badge, image, alt, service, status, featured, expires, note, sort_order });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (/INSERT INTO revisions/.test(sql)) { this.revisions.push({ created_at: args[4] }); return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  }
}

const ownerEnv = (seed) => ({ ADMIN_EMAILS: 'owner@example.com', SUBSCRIBERS: new MockD1(seed) });

test('public offers: hides drafts + expired, featured first', async () => {
  const env = ownerEnv([
    { title: 'Live A', status: 'live', featured: 0, sort_order: 1 },
    { title: 'Featured', status: 'live', featured: 1, sort_order: 2 },
    { title: 'Draft one', status: 'draft', sort_order: 3 },
    { title: 'Expired', status: 'live', expires: PAST, sort_order: 4 },
  ]);
  const res = await worker.fetch(req('/api/offers'), env);
  assert.equal(res.status, 200);
  const { offers } = await readJson(res);
  const titles = offers.map((o) => o.title);
  assert.deepEqual(titles, ['Featured', 'Live A']); // featured first; draft + expired hidden
});

test('public offers: falls back to offers.json when the table is missing', async () => {
  const env = ownerEnv([]);
  env.SUBSCRIBERS.throwOnOffers = true;
  env.SITE_ORIGIN = 'https://lumidermaesthetics.com';
  env.ASSETS = { async fetch() {
    return new Response(JSON.stringify({ offers: [
      { title: 'From file', status: 'live', expires: '' },
      { title: 'Filedraft', status: 'draft' },
    ] }), { headers: { 'content-type': 'application/json' } });
  } };
  const res = await worker.fetch(req('/api/offers'), env);
  const { offers } = await readJson(res);
  assert.deepEqual(offers.map((o) => o.title), ['From file']); // draft hidden even in fallback
});

test('admin can save offers; public then reflects them', async () => {
  const env = ownerEnv([]);
  const save = await worker.fetch(req('/admin/api/offers/save', {
    method: 'POST', headers: { ...ownerHeaders, ...jsonHeaders },
    body: JSON.stringify({ offers: [
      { title: 'New live', status: 'live', expires: FUTURE },
      { title: 'Hidden', status: 'draft' },
    ] }),
  }), env);
  assert.equal(save.status, 200);
  const saved = await readJson(save);
  assert.equal(saved.ok, true);
  assert.equal(saved.live, 1);

  const pub = await worker.fetch(req('/api/offers'), env);
  assert.deepEqual((await readJson(pub)).offers.map((o) => o.title), ['New live']);
});

test('admin save rejects two live offers with the same title', async () => {
  const env = ownerEnv([]);
  const res = await worker.fetch(req('/admin/api/offers/save', {
    method: 'POST', headers: { ...ownerHeaders, ...jsonHeaders },
    body: JSON.stringify({ offers: [
      { title: 'Same', status: 'live' },
      { title: 'Same', status: 'live' },
    ] }),
  }), env);
  assert.equal(res.status, 400);
  assert.match((await readJson(res)).error, /share the title/i);
});

test('admin save requires a title on every offer', async () => {
  const env = ownerEnv([]);
  const res = await worker.fetch(req('/admin/api/offers/save', {
    method: 'POST', headers: { ...ownerHeaders, ...jsonHeaders },
    body: JSON.stringify({ offers: [{ title: '', status: 'live' }] }),
  }), env);
  assert.equal(res.status, 400);
});

test('assistant cannot publish offers', async () => {
  const env = {
    ADMIN_EMAILS: 'owner@example.com,help@example.com',
    ADMIN_OWNER_EMAILS: 'owner@example.com',
    ADMIN_EDITOR_EMAILS: 'help@example.com',
    SUBSCRIBERS: new MockD1([]),
  };
  const res = await worker.fetch(req('/admin/api/offers/save', {
    method: 'POST',
    headers: { 'cf-access-authenticated-user-email': 'help@example.com', ...jsonHeaders },
    body: JSON.stringify({ offers: [{ title: 'X', status: 'live' }] }),
  }), env);
  assert.equal(res.status, 403);
});

const upsert = (env, offer) => worker.fetch(req('/admin/api/offers/upsert', {
  method: 'POST', headers: { ...ownerHeaders, ...jsonHeaders }, body: JSON.stringify({ offer }),
}), env);

test('upsert inserts a new offer and returns its id', async () => {
  const env = ownerEnv([]);
  const res = await upsert(env, { title: 'Fresh live', status: 'live', description: 'nice', expires: FUTURE });
  assert.equal(res.status, 200);
  const p = await readJson(res);
  assert.equal(p.ok, true);
  assert.ok(p.id);
  const pub = await worker.fetch(req('/api/offers'), env);
  assert.deepEqual((await readJson(pub)).offers.map((o) => o.title), ['Fresh live']);
});

test('upsert updates an existing offer by id', async () => {
  const env = ownerEnv([{ title: 'Old title', status: 'live', description: 'd' }]);
  const res = await upsert(env, { id: 1, title: 'New title', status: 'live', description: 'd' });
  assert.equal(res.status, 200);
  const pub = await worker.fetch(req('/api/offers'), env);
  assert.deepEqual((await readJson(pub)).offers.map((o) => o.title), ['New title']);
});

test('upsert rejects a live offer with no description', async () => {
  const env = ownerEnv([]);
  const res = await upsert(env, { title: 'Live no desc', status: 'live', description: '' });
  assert.equal(res.status, 400);
  assert.match((await readJson(res)).error, /description/i);
});

test('upsert allows a draft with no description', async () => {
  const env = ownerEnv([]);
  const res = await upsert(env, { title: 'Draft ok', status: 'draft', description: '' });
  assert.equal(res.status, 200);
});

test('upsert rejects a live title already used by another live offer', async () => {
  const env = ownerEnv([{ title: 'Taken', status: 'live', description: 'd' }]);
  const res = await upsert(env, { title: 'Taken', status: 'live', description: 'd' }); // no id => new
  assert.equal(res.status, 400);
  assert.match((await readJson(res)).error, /already uses the title/i);
});

test('delete removes one offer by id', async () => {
  const env = ownerEnv([{ title: 'Keep', status: 'live', description: 'd' }, { title: 'Drop', status: 'live', description: 'd' }]);
  const res = await worker.fetch(req('/admin/api/offers/delete', {
    method: 'POST', headers: { ...ownerHeaders, ...jsonHeaders }, body: JSON.stringify({ id: 2 }),
  }), env);
  assert.equal(res.status, 200);
  const pub = await worker.fetch(req('/api/offers'), env);
  assert.deepEqual((await readJson(pub)).offers.map((o) => o.title), ['Keep']);
});
