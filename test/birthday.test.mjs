import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/worker.js';

const ownerHeaders = { 'cf-access-authenticated-user-email': 'owner@example.com' };
const jsonHeaders = { 'content-type': 'application/json' };

function req(path, options = {}) {
  return new Request('https://lumidermaesthetics.com' + path, {
    ...options,
    headers: { ...(options.headers || {}) },
  });
}

// A future / past ISO date helper.
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

class MockD1 {
  constructor() {
    this.vouchers = [
      { id: 1, code: 'BDAY-AAAAA', token: 'abcd1234efgh5678', email: 'jane@example.com', name: 'Jane', discount: 15, status: 'active', issued_at: inDays(-1), expires_at: inDays(29) },
      { id: 2, code: 'BDAY-BBBBB', token: 'expiredtoken0001', email: 'bob@example.com', name: 'Bob', discount: 15, status: 'active', issued_at: inDays(-40), expires_at: inDays(-10) },
    ];
    this.subscribers = [{ email: 'jane@example.com', status: 'confirmed' }];
  }
  prepare(sql) {
    const db = this; let args = [];
    return {
      bind(...a) { args = a; return this; },
      async first() { return db._first(sql, args); },
      async all() { return { results: db._all(sql, args) }; },
      async run() { return db._run(sql, args); },
    };
  }
  _first(sql, args) {
    if (/FROM birthday_vouchers WHERE token/.test(sql)) return this.vouchers.find((v) => v.token === args[0]) || null;
    if (/COUNT\(\*\) AS c FROM admin_audit_log/.test(sql)) return { c: 0 };
    return null;
  }
  _all(sql) {
    if (/FROM birthday_vouchers ORDER BY issued_at DESC/.test(sql)) return this.vouchers.map((v) => ({ ...v }));
    if (/FROM subscribers WHERE status='confirmed'/.test(sql)) return [];
    return [];
  }
  _run(sql, args) {
    if (/UPDATE birthday_vouchers SET status='requested'/.test(sql)) {
      const v = this.vouchers.find((x) => x.id === args[5]); if (v) v.status = 'requested';
      return { meta: { changes: v ? 1 : 0 } };
    }
    if (/UPDATE birthday_vouchers SET status='redeemed'/.test(sql)) {
      const v = this.vouchers.find((x) => x.id === args[2]); if (v) v.status = 'redeemed';
      return { meta: { changes: v ? 1 : 0 } };
    }
    if (/UPDATE subscribers SET birth_day/.test(sql)) {
      const s = this.subscribers.find((x) => x.email === args[2]); return { meta: { changes: s ? 1 : 0 } };
    }
    return { meta: { changes: 1 } };
  }
}

function env() {
  return { ADMIN_EMAILS: 'owner@example.com', SUBSCRIBERS: new MockD1(), UNSUB_SECRET: 'test_secret' };
}

async function readJson(res) { return res.json(); }

test('voucher lookup returns an active code', async () => {
  const res = await worker.fetch(req('/api/birthday/voucher?t=abcd1234efgh5678'), env());
  assert.equal(res.status, 200);
  const p = await readJson(res);
  assert.equal(p.status, 'active');
  assert.equal(p.code, 'BDAY-AAAAA');
  assert.equal(p.discount, 15);
});

test('voucher lookup reports expired', async () => {
  const res = await worker.fetch(req('/api/birthday/voucher?t=expiredtoken0001'), env());
  const p = await readJson(res);
  assert.equal(p.status, 'expired');
  assert.equal(p.ok, false);
});

test('voucher lookup rejects an unknown token', async () => {
  const res = await worker.fetch(req('/api/birthday/voucher?t=deadbeefdeadbeef'), env());
  assert.equal(res.status, 404);
});

test('appointment request records against an active voucher', async () => {
  const res = await worker.fetch(req('/api/birthday/request', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ token: 'abcd1234efgh5678', phone: '07000 000000', treatment: 'Facial', company: '' }),
  }), env());
  assert.equal(res.status, 200);
  assert.equal((await readJson(res)).ok, true);
});

test('appointment request refuses an expired voucher', async () => {
  const res = await worker.fetch(req('/api/birthday/request', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ token: 'expiredtoken0001', phone: '07000 000000' }),
  }), env());
  assert.equal(res.status, 410);
});

test('appointment request honeypot silently succeeds', async () => {
  const res = await worker.fetch(req('/api/birthday/request', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ token: 'abcd1234efgh5678', phone: '07000', company: 'bot' }),
  }), env());
  assert.equal(res.status, 200);
});

test('admin can list and redeem vouchers; assistant cannot', async () => {
  const list = await worker.fetch(req('/admin/api/birthday/vouchers', { headers: ownerHeaders }), env());
  assert.equal(list.status, 200);
  assert.ok(Array.isArray((await readJson(list)).vouchers));

  const redeem = await worker.fetch(req('/admin/api/birthday/vouchers/resolve', {
    method: 'POST', headers: { ...ownerHeaders, ...jsonHeaders }, body: JSON.stringify({ id: 1, action: 'redeem' }),
  }), env());
  assert.equal(redeem.status, 200);
  assert.equal((await readJson(redeem)).ok, true);

  const assistant = await worker.fetch(req('/admin/api/birthday/vouchers/resolve', {
    method: 'POST',
    headers: { 'cf-access-authenticated-user-email': 'help@example.com', ...jsonHeaders },
    body: JSON.stringify({ id: 1, action: 'redeem' }),
  }), { ADMIN_EMAILS: 'owner@example.com,help@example.com', ADMIN_OWNER_EMAILS: 'owner@example.com', ADMIN_EDITOR_EMAILS: 'help@example.com', SUBSCRIBERS: new MockD1() });
  assert.equal(assistant.status, 403);
});
