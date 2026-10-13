import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/worker.js';
import { accessEnv, accessHeaders, invalidAccessHeaders } from './access-token.mjs';

const adminHeaders = accessHeaders('owner@example.com');

function req(path, options = {}) {
  return new Request('https://lumidermaesthetics.com' + path, {
    ...options,
    headers: { ...(options.headers || {}) },
  });
}

async function json(res) {
  return res.json();
}

class MockKV {
  constructor() { this.map = new Map(); }
  get(key) { return Promise.resolve(this.map.get(key) || null); }
  put(key, value) { this.map.set(key, value); return Promise.resolve(); }
  delete(key) { if (this.failDelete) return Promise.reject(new Error('KV unavailable')); this.map.delete(key); return Promise.resolve(); }
}

class MockR2 {
  constructor() { this.objects = new Map(); }
  async get(key) {
    const obj = this.objects.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      httpEtag: obj.httpEtag,
      writeHttpMetadata(headers) {
        if (obj.httpMetadata?.contentType) headers.set('content-type', obj.httpMetadata.contentType);
        if (obj.httpMetadata?.cacheControl) headers.set('cache-control', obj.httpMetadata.cacheControl);
      },
    };
  }
  async put(key, body, options = {}) {
    this.objects.set(key, {
      body,
      httpMetadata: options.httpMetadata || {},
      httpEtag: '"mock-etag"',
      uploaded: new Date(),
      size: body && body.byteLength ? body.byteLength : 0,
    });
  }
  async delete(key) { this.objects.delete(key); }
  async list({ prefix } = {}) {
    return {
      objects: [...this.objects.entries()]
        .filter(([key]) => !prefix || key.startsWith(prefix))
        .map(([key, obj]) => ({ key, size: obj.size, uploaded: obj.uploaded })),
    };
  }
}

function isStaleSending(row, staleBefore) {
  const result = String(row.result || '');
  const prefix = 'Started by cron at ';
  if (result.startsWith(prefix)) {
    return result.slice(prefix.length, prefix.length + 24) <= staleBefore;
  }
  return String(row.send_at || '') <= staleBefore;
}

class MockD1 {
  constructor() {
    this.subscribers = [];
    this.campaignSends = [];
    this.campaignEvents = [];
    this.scheduledCampaigns = [];
    this.birthdayVouchers = [];
    this.reviewSubmissions = [];
    this.settings = new Map();
    this.siteContent = new Map();
    this.audit = [];
    this.nextScheduledId = 1;
    this.failPreferenceRead = false;
    this.failScheduledRead = false;
  }
  prepare(sql) {
    const db = this;
    return {
      _args: [],
      bind(...args) { this._args = args; return this; },
      async first() { return db._first(sql, this._args); },
      async all() { return { results: db._all(sql, this._args) }; },
      async run() { return db._run(sql, this._args); },
    };
  }
  async batch(statements) {
    const snapshot = structuredClone({ subscribers: this.subscribers, campaignEvents: this.campaignEvents,
      birthdayVouchers: this.birthdayVouchers, reviewSubmissions: this.reviewSubmissions,
      scheduledCampaigns: this.scheduledCampaigns, settings: this.settings });
    try {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    } catch (err) {
      Object.assign(this, snapshot);
      throw err;
    }
  }
  _first(sql, args) {
    if (/SELECT value FROM app_settings WHERE key=\?1/.test(sql)) {
      return this.settings.has(args[0]) ? { value: this.settings.get(args[0]) } : null;
    }
    if (/SELECT COUNT\(\*\) AS c FROM app_settings/.test(sql)) {
      const prefix = sql.includes('birthday-delivery:') ? 'birthday-delivery:' : 'erasure:';
      return { c: [...this.settings.keys()].filter(key => key.startsWith(prefix)).length };
    }
    if (/SELECT status FROM subscribers WHERE email/.test(sql)) {
      const row = this.subscribers.find((s) => s.email === args[0]);
      return row ? { status: row.status } : null;
    }
    if (/SELECT email, first_name, last_name, birth_day, birth_month, interest, status, consent_email/.test(sql)) {
      const row = this.subscribers.find((s) => s.email === args[0]);
      return row || null;
    }
    if (/SELECT email, first_name, status, consent_email, pref_birthday, pause_until FROM subscribers WHERE email/.test(sql)) {
      const row = this.subscribers.find((s) => s.email === args[0]);
      return row || null;
    }
    if (/SELECT value FROM app_settings WHERE key='birthday'/.test(sql)) {
      const value = this.settings.get('birthday');
      return value ? { value } : null;
    }
    if (/SELECT COUNT\(\*\) AS c FROM scheduled_campaigns WHERE status='error'/.test(sql)) {
      const staleBefore = args[0] || new Date().toISOString();
      return {
        c: this.scheduledCampaigns.filter((row) => (
          row.status === 'error' ||
          (row.status === 'sending' && isStaleSending(row, staleBefore))
        )).length,
      };
    }
    return null;
  }
  _all(sql, args = []) {
    if (/SELECT key, value FROM app_settings/.test(sql)) {
      return [...this.settings].filter(([key]) => key.startsWith('erasure:')).map(([key, value]) => ({ key, value }));
    }
    if (/SELECT key, value FROM site_content WHERE key IN/.test(sql)) {
      const keys = args.length ? args : [...sql.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      return keys
        .filter((key) => this.siteContent.has(key))
        .map((key) => ({ key, value: this.siteContent.get(key) }));
    }
    if (/SELECT email, pref_offers, pref_skintips, pref_news, pref_birthday, pref_frequency, pause_until, last_emailed_at/.test(sql)) {
      if (this.failPreferenceRead) throw new Error('preference read failed');
      const wanted = new Set(args.map((email) => String(email || '').toLowerCase()));
      return this.subscribers
        .filter((row) => wanted.has(String(row.email || '').toLowerCase()))
        .map((row) => ({
          email: row.email,
          pref_offers: row.pref_offers ?? 1,
          pref_skintips: row.pref_skintips ?? 1,
          pref_news: row.pref_news ?? 1,
          pref_birthday: row.pref_birthday ?? 1,
          pref_frequency: row.pref_frequency || 'any',
          pause_until: row.pause_until || null,
          last_emailed_at: row.last_emailed_at || null,
        }));
    }
    if (/FROM subscribers ORDER BY created_at DESC/.test(sql)) {
      return [...this.subscribers].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    if (/SELECT email, first_name FROM subscribers/.test(sql) && /birth_day=\?1 AND birth_month=\?2/.test(sql)) {
      const [day, month, year, limit, nowIso] = args;
      return this.subscribers.filter((s) => (
        s.status === 'confirmed' &&
        Number(s.consent_email) === 1 &&
        Number(s.birth_day) === Number(day) &&
        Number(s.birth_month) === Number(month) &&
        Number(s.birthday_sent_year || 0) < Number(year) &&
        Number(s.pref_birthday ?? 1) === 1 &&
        !this.settings.has('birthday-delivery:' + year + ':' + s.email.toLowerCase()) &&
        (!s.pause_until || s.pause_until <= nowIso)
      )).slice(0, limit);
    }
    if (/FROM subscribers\s+WHERE status='confirmed' AND consent_email=1/.test(sql) && /birth_day IS NOT NULL/.test(sql)) {
      const nowIso = args[0] || new Date().toISOString();
      return this.subscribers.filter((s) => (
        s.status === 'confirmed' &&
        Number(s.consent_email) === 1 &&
        Number(s.pref_birthday ?? 1) === 1 &&
        (!s.pause_until || s.pause_until <= nowIso) &&
        s.birth_day != null &&
        s.birth_month != null
      ));
    }
    if (/FROM campaign_sends/.test(sql)) return this.campaignSends;
    if (/FROM scheduled_campaigns\s+WHERE status='queued' AND send_at <=/.test(sql)) {
      if (this.failScheduledRead) throw new Error('scheduled read failed');
      const nowIso = args[0] || new Date().toISOString();
      return this.scheduledCampaigns
        .filter((row) => row.status === 'queued' && String(row.send_at || '') <= nowIso)
        .sort((a, b) => String(a.send_at).localeCompare(String(b.send_at)))
        .slice(0, 10);
    }
    if (/SELECT id, recipients FROM scheduled_campaigns/.test(sql)) {
      const needle = String(args[0] || '').replace(/%/g, '').toLowerCase();
      return this.scheduledCampaigns.filter((row) => String(row.recipients || '').toLowerCase().includes(needle));
    }
    if (/FROM scheduled_campaigns/.test(sql)) return this.scheduledCampaigns.map((row) => ({
      ...row,
      recipient_count: JSON.parse(row.recipients || '[]').length,
    }));
    return [];
  }
  _run(sql, args) {
    if (/pref_offers, pref_skintips, pref_news, pref_birthday, pref_frequency, pause_until/.test(sql)) {
      const [email, firstName, lastName, birthDay, birthMonth, interest, now, , , , , , , consentWording, consentSource] = args;
      const existing = this.subscribers.find((s) => s.email === email);
      const row = {
        email,
        first_name: firstName,
        last_name: lastName,
        birth_day: birthDay,
        birth_month: birthMonth,
        interest,
        status: 'confirmed',
        consent_email: 1,
        consent_wording: existing?.consent_wording ? existing.consent_wording + '\n' + consentWording : consentWording,
        consent_source: existing?.consent_source ? existing.consent_source + '\n' + consentSource : consentSource,
        confirm_token: null,
        created_at: existing?.created_at || now,
        confirmed_at: existing?.confirmed_at || now,
        unsubscribed_at: null,
      };
      if (existing) Object.assign(existing, row);
      else this.subscribers.push(row);
      return { meta: { changes: 1 } };
    }
    if (/INSERT INTO subscribers/.test(sql)) {
      const [email, firstName, lastName, birthDay, birthMonth, interest, wording, source, ip, now] = args;
      const existing = this.subscribers.find((s) => s.email === email);
      const row = {
        email,
        first_name: firstName,
        last_name: lastName,
        birth_day: birthDay,
        birth_month: birthMonth,
        interest,
        status: 'confirmed',
        consent_email: 1,
        consent_wording: wording,
        consent_source: source,
        signup_ip: ip,
        confirm_token: null,
        created_at: existing?.created_at || now,
        confirmed_at: now,
        unsubscribed_at: null,
      };
      if (existing) Object.assign(existing, row);
      else this.subscribers.push(row);
      return { meta: { changes: 1 } };
    }
    if (/UPDATE subscribers SET status = 'unsubscribed'/.test(sql)) {
      const row = this.subscribers.find((s) => s.email === args[1]);
      if (row) { row.status = 'unsubscribed'; row.unsubscribed_at = args[0]; }
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/DELETE FROM subscribers/.test(sql)) {
      const before = this.subscribers.length;
      this.subscribers = this.subscribers.filter((s) => String(s.email || '').toLowerCase() !== args[0]);
      return { meta: { changes: before - this.subscribers.length } };
    }
    if (/DELETE FROM campaign_events/.test(sql)) {
      if (this.failErase) throw new Error('erasure write failed');
      const before = this.campaignEvents.length;
      this.campaignEvents = this.campaignEvents.filter((row) => String(row.email || '').toLowerCase() !== args[0]);
      return { meta: { changes: before - this.campaignEvents.length } };
    }
    if (/DELETE FROM birthday_vouchers/.test(sql)) {
      const before = this.birthdayVouchers.length;
      this.birthdayVouchers = this.birthdayVouchers.filter((row) => String(row.email || '').toLowerCase() !== args[0]);
      return { meta: { changes: before - this.birthdayVouchers.length } };
    }
    if (/DELETE FROM review_submissions/.test(sql)) {
      const before = this.reviewSubmissions.length;
      this.reviewSubmissions = this.reviewSubmissions.filter((row) => String(row.email || '').toLowerCase() !== args[0]);
      return { meta: { changes: before - this.reviewSubmissions.length } };
    }
    if (/INSERT INTO campaign_sends/.test(sql)) {
      this.campaignSends.push({ id: this.campaignSends.length + 1, subject: args[0], created_at: args[9], campaign_id: args[10] || null });
      return { meta: { changes: 1 } };
    }
    if (/INSERT INTO campaign_events/.test(sql)) {
      this.campaignEvents.push({ campaign_id: args[0], email: args[1], event_type: args[2], detail: args[3], created_at: args[4] });
      return { meta: { changes: 1 } };
    }
    if (/INSERT INTO scheduled_campaigns/.test(sql)) {
      this.scheduledCampaigns.push({
        id: this.nextScheduledId++,
        subject: args[0],
        html: args[1],
        audience_source: args[2],
        recipients: args[3],
        send_at: args[4],
        status: 'queued',
        created_at: args[5],
      });
      return { meta: { changes: 1 } };
    }
    if (/UPDATE scheduled_campaigns[\s\S]+SET status='cancelled'/.test(sql)) {
      const staleBefore = args[1] || new Date().toISOString();
      const row = this.scheduledCampaigns.find((s) => (
        s.id === Number(args[0]) &&
        (s.status === 'queued' || s.status === 'error' || (s.status === 'sending' && isStaleSending(s, staleBefore)))
      ));
      if (row) row.status = 'cancelled';
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/UPDATE scheduled_campaigns\s+SET status='error', result=/.test(sql)) {
      const staleBefore = args[1] || new Date().toISOString();
      let changes = 0;
      this.scheduledCampaigns.forEach((row) => {
        if (row.status === 'sending' && isStaleSending(row, staleBefore)) {
          row.status = 'error';
          row.result = args[0];
          changes += 1;
        }
      });
      return { meta: { changes } };
    }
    if (/UPDATE scheduled_campaigns SET status='sending'/.test(sql)) {
      const row = this.scheduledCampaigns.find((s) => s.id === Number(args[0]) && s.status === 'queued');
      if (row) { row.status = 'sending'; row.result = args[1]; }
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/UPDATE scheduled_campaigns SET status='error'/.test(sql)) {
      const row = this.scheduledCampaigns.find((s) => s.id === Number(args[2]) && s.status === 'sending');
      if (row) { row.status = 'error'; row.sent_at = args[0]; row.result = args[1]; }
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/UPDATE scheduled_campaigns SET status=\?1/.test(sql)) {
      const row = this.scheduledCampaigns.find((s) => s.id === Number(args[3]) && s.status === 'sending');
      if (row) { row.status = args[0]; row.sent_at = args[1]; row.result = args[2]; }
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/UPDATE scheduled_campaigns SET recipients/.test(sql)) {
      const row = this.scheduledCampaigns.find((s) => s.id === Number(args[1]));
      if (row) row.recipients = JSON.stringify(JSON.parse(row.recipients).filter(person => String(person.email || '').trim().toLowerCase() !== args[0]));
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/INSERT INTO app_settings/.test(sql)) {
      if (sql.includes('VALUES (?1,?2,?3)') || sql.includes('SELECT ?1,?2,?3')) {
        if (sql.includes('WHERE EXISTS') && !this.subscribers.some(row => row.email === args[3] && Number(row.birthday_sent_year || 0) < args[4])) {
          return { meta: { changes: 0 } };
        }
        if (sql.includes('DO NOTHING') && this.settings.has(args[0])) return { meta: { changes: 0 } };
        this.settings.set(args[0], args[1]);
        return { meta: { changes: 1 } };
      }
      this.settings.set('birthday', args[0]);
      return { meta: { changes: 1 } };
    }
    if (/DELETE FROM app_settings WHERE key=\?1/.test(sql)) {
      return { meta: { changes: this.settings.delete(args[0]) ? 1 : 0 } };
    }
    if (/DELETE FROM app_settings WHERE key LIKE/.test(sql)) {
      let changes = 0;
      for (const key of this.settings.keys()) if (key.startsWith('birthday-delivery:') && key.endsWith(args[0])) {
        this.settings.delete(key); changes++;
      }
      return { meta: { changes } };
    }
    if (/UPDATE subscribers SET birthday_sent_year/.test(sql)) {
      const row = this.subscribers.find((s) => s.email === args[1]);
      if (row) row.birthday_sent_year = args[0];
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/INSERT INTO admin_audit_log/.test(sql)) {
      this.audit.push({ action: args[2], detail: args[3], status: args[5] });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

function env() {
  return accessEnv({
    ADMIN_EMAILS: 'owner@example.com',
    SUBSCRIBERS: new MockD1(),
    SUPPRESSION: new MockKV(),
    RESEND_API_KEY: 'test_resend_key',
    UNSUB_SECRET: 'test_secret',
    FROM_EMAIL: 'Lumi Derm <info@lumidermaesthetics.com>',
    REPLY_TO: 'info@lumidermaesthetics.co.uk',
    CONTACT_EMAIL: 'info@lumidermaesthetics.co.uk',
  });
}

function assistantEnv() {
  return {
    ...env(),
    ADMIN_EMAILS: 'owner@example.com,assistant@example.com',
    ADMIN_OWNER_EMAILS: 'owner@example.com',
    ADMIN_EDITOR_EMAILS: 'assistant@example.com',
  };
}

function assetsWithReviews() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname !== '/assets/data/reviews.json') {
        return new Response('Not found', { status: 404 });
      }
      return Response.json({
        summary: { rating: '5.0', count: 47, label: 'Treatwell reviews' },
        reviews: [
          {
            name: 'Elena',
            initial: 'E',
            rating: 5,
            treatment: 'Lymphatic Drainage',
            source: 'Client feedback',
            text: 'Professional, calm care in a clean studio.',
          },
        ],
      });
    },
  };
}

function assetsFromMap(files) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (!Object.hasOwn(files, url.pathname)) {
        return new Response('Not found', { status: 404 });
      }
      const body = files[url.pathname];
      const contentType = url.pathname.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8';
      return new Response(body, { headers: { 'content-type': contentType } });
    },
  };
}

async function sign(email, secret = 'test_secret') {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

test('admin routes require Cloudflare Access identity', async () => {
  const res = await worker.fetch(req('/admin/api/subscribers'), env());
  assert.equal(res.status, 401);
  assert.match((await json(res)).error, /Access sign-in/i);

  const spoofed = await worker.fetch(req('/admin/api/subscribers', {
    headers: { 'cf-access-authenticated-user-email': 'owner@example.com' },
  }), env());
  assert.equal(spoofed.status, 401);

  const tampered = await worker.fetch(req('/admin/api/subscribers', { headers: invalidAccessHeaders }), env());
  assert.equal(tampered.status, 401);
});

test('subscriber import and list use D1 and require explicit consent', async () => {
  const e = env();
  const importRes = await worker.fetch(req('/admin/api/subscribers/import', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      subscribers: [
        { email: 'client@example.com', first_name: 'Client', consent_email: true },
        { email: 'no-consent@example.com', consent_email: false },
        { email: 'bad-email', consent_email: true },
      ],
    }),
  }), e);
  assert.equal(importRes.status, 200);
  assert.deepEqual(await json(importRes), {
    ok: true,
    imported: 1,
    updated: 0,
    invalid: 1,
    skippedNoConsent: 1,
    skippedSuppressed: 0,
    skippedUnsubscribed: 0,
  });

  const listRes = await worker.fetch(req('/admin/api/subscribers', { headers: adminHeaders }), e);
  const list = await json(listRes);
  assert.equal(list.counts.confirmed, 1);
  assert.equal(list.subscribers[0].email, 'client@example.com');
});

test('subscriber delete erases personal data outside the lawful audit log', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push(
    { email: 'client@example.com', status: 'confirmed' },
    { email: 'other@example.com', status: 'confirmed' },
  );
  e.SUBSCRIBERS.campaignEvents.push(
    { campaign_id: 'cmp1', email: 'client@example.com', event_type: 'click' },
    { campaign_id: 'cmp1', email: 'other@example.com', event_type: 'click' },
  );
  e.SUBSCRIBERS.birthdayVouchers.push(
    { id: 1, email: 'client@example.com', name: 'Client', req_phone: '07000' },
    { id: 2, email: 'other@example.com', name: 'Other', req_phone: '07111' },
  );
  e.SUBSCRIBERS.reviewSubmissions.push(
    { id: 1, email: 'client@example.com', name: 'Client', text: 'Private follow-up' },
    { id: 2, email: 'other@example.com', name: 'Other', text: 'Keep me' },
  );
  e.SUBSCRIBERS.scheduledCampaigns.push(
    {
      id: 1,
      recipients: JSON.stringify([
        { email: 'client@example.com', name: 'Client' },
        { email: 'other@example.com', name: 'Other' },
      ]),
      status: 'queued',
    },
    {
      id: 2,
      recipients: JSON.stringify([{ email: 'other@example.com', name: 'Other' }]),
      status: 'queued',
    },
  );
  await e.SUPPRESSION.put('unsub:client@example.com', JSON.stringify({ at: '2026-07-21T00:00:00.000Z' }));

  const res = await worker.fetch(req('/admin/api/subscribers/delete', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'client@example.com' }),
  }), e);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.deepEqual(body.erased, {
    subscribers: 1,
    campaignEvents: 1,
    birthdayVouchers: 1,
    reviewSubmissions: 1,
    scheduledCampaigns: { changed: 1, removed: 1 },
    suppression: true,
  });
  assert.deepEqual(e.SUBSCRIBERS.subscribers.map((row) => row.email), ['other@example.com']);
  assert.deepEqual(e.SUBSCRIBERS.campaignEvents.map((row) => row.email), ['other@example.com']);
  assert.deepEqual(e.SUBSCRIBERS.birthdayVouchers.map((row) => row.email), ['other@example.com']);
  assert.deepEqual(e.SUBSCRIBERS.reviewSubmissions.map((row) => row.email), ['other@example.com']);
  assert.deepEqual(JSON.parse(e.SUBSCRIBERS.scheduledCampaigns[0].recipients), [{ email: 'other@example.com', name: 'Other' }]);
  assert.equal(await e.SUPPRESSION.get('unsub:client@example.com'), null);
  assert.equal(e.SUBSCRIBERS.audit.at(-1).action, 'subscriber.delete');
});

test('campaign send validates required input before delivery', async () => {
  const res = await worker.fetch(req('/admin/api/campaign/send', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ subject: 'Hello', html: '<p>Hello</p>', recipients: [] }),
  }), env());
  assert.equal(res.status, 400);
  assert.match((await json(res)).error, /No recipients/);
});

test('campaign send fails closed when preferences cannot be checked', async () => {
  const e = env();
  e.SUBSCRIBERS.failPreferenceRead = true;
  e.SUBSCRIBERS.subscribers.push({
    email: 'client@example.com',
    status: 'confirmed',
    consent_email: 1,
    pref_offers: 0,
  });

  const originalFetch = globalThis.fetch;
  let resendCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://api.resend.com/emails/batch') {
      resendCalls += 1;
      return Response.json({ ok: true });
    }
    return originalFetch(url, options);
  };

  try {
    const res = await worker.fetch(req('/admin/api/campaign/send', {
      method: 'POST',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: 'Offers',
        html: '<p>Hello {{unsubscribe}} {{preferences}}</p>',
        topic: 'offers',
        recipients: [{ email: 'client@example.com' }],
      }),
    }), e);
    assert.equal(res.status, 500);
    const body = await json(res);
    assert.match(body.error, /preferences could not be checked/i);
    assert.equal(body.sent, 0);
    assert.deepEqual(body.skipped, { paused: 0, topicOut: 0, capped: 0 });
    assert.equal(resendCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('assistant role cannot send campaigns', async () => {
  const res = await worker.fetch(req('/admin/api/campaign/send', {
    method: 'POST',
    headers: { ...accessHeaders('assistant@example.com'), 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: 'Hello',
      html: '<p>Hello {{unsubscribe}} {{preferences}}</p>',
      recipients: [{ email: 'client@example.com' }],
    }),
  }), assistantEnv());
  assert.equal(res.status, 403);
  assert.match((await json(res)).error, /Owner access/i);
});

test('assistant role cannot read subscriber personal data', async () => {
  const res = await worker.fetch(req('/admin/api/subscribers', {
    headers: accessHeaders('assistant@example.com'),
  }), assistantEnv());
  assert.equal(res.status, 403);
  assert.match((await json(res)).error, /Owner access/i);
});

test('unsubscribe GET shows a confirmation page without mutating records', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push({ email: 'client@example.com', status: 'confirmed', created_at: '2026-07-21T00:00:00.000Z' });
  const token = await sign('client@example.com');
  const res = await worker.fetch(req('/api/unsubscribe?e=client%40example.com&t=' + token + '&c=cmp_1'), e);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Confirm unsubscribe/);
  assert.equal(await e.SUPPRESSION.get('unsub:client@example.com'), null);
  assert.equal(e.SUBSCRIBERS.subscribers[0].status, 'confirmed');
  assert.equal(e.SUBSCRIBERS.campaignEvents.length, 0);
});

test('unsubscribe POST with RFC 8058 body updates suppression list and D1 status', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push({ email: 'client@example.com', status: 'confirmed', created_at: '2026-07-21T00:00:00.000Z' });
  const token = await sign('client@example.com');
  const res = await worker.fetch(req('/api/unsubscribe?e=client%40example.com&t=' + token + '&c=cmp_1', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  }), e);
  assert.equal(res.status, 200);
  assert.equal(await e.SUPPRESSION.get('unsub:client@example.com') !== null, true);
  assert.equal(e.SUBSCRIBERS.subscribers[0].status, 'unsubscribed');
  assert.equal(e.SUBSCRIBERS.campaignEvents[0].event_type, 'unsubscribe');
});

test('unsubscribe POST without RFC 8058 body does not mutate records', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push({ email: 'client@example.com', status: 'confirmed', created_at: '2026-07-21T00:00:00.000Z' });
  const token = await sign('client@example.com');
  const res = await worker.fetch(req('/api/unsubscribe?e=client%40example.com&t=' + token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'confirm=1',
  }), e);
  assert.equal(res.status, 400);
  assert.equal(await e.SUPPRESSION.get('unsub:client@example.com'), null);
  assert.equal(e.SUBSCRIBERS.subscribers[0].status, 'confirmed');
});

test('unsubscribe link fails closed when UNSUB_SECRET is missing', async () => {
  const e = env();
  delete e.UNSUB_SECRET;
  e.SUBSCRIBERS.subscribers.push({ email: 'client@example.com', status: 'confirmed', created_at: '2026-07-21T00:00:00.000Z' });
  const fallbackToken = await sign('client@example.com', 'lumi-derm-fallback');

  const res = await worker.fetch(req('/api/unsubscribe?e=client%40example.com&t=' + fallbackToken), e);
  assert.equal(res.status, 400);
  assert.equal(e.SUBSCRIBERS.subscribers[0].status, 'confirmed');
});

test('preference centre updates subscriber consent details', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push({
    email: 'client@example.com',
    first_name: 'Old',
    status: 'confirmed',
    consent_email: 1,
    consent_wording: 'Original website signup wording',
    consent_source: 'website newsletter form',
    created_at: '2026-07-21T00:00:00.000Z',
    confirmed_at: '2026-07-21T00:05:00.000Z',
  });
  const token = await sign('client@example.com');
  const form = new FormData();
  form.set('email', 'client@example.com');
  form.set('token', token);
  form.set('first_name', 'Client');
  form.set('last_name', 'Person');
  form.set('interest', 'Facials & peels');
  form.set('birth_day', '12');
  form.set('birth_month', '5');
  form.set('subscribed', '1');
  const res = await worker.fetch(req('/api/preferences', { method: 'POST', body: form }), e);
  assert.equal(res.status, 200);
  assert.equal(e.SUBSCRIBERS.subscribers[0].interest, 'Facials & peels');
  assert.equal(e.SUBSCRIBERS.subscribers[0].consent_email, 1);
  assert.match(e.SUBSCRIBERS.subscribers[0].consent_wording, /^Original website signup wording\nPreference centre saved at /);
  assert.match(e.SUBSCRIBERS.subscribers[0].consent_source, /^website newsletter form\npreference centre/);
});

test('tracked campaign click records an event and redirects', async () => {
  const e = env();
  const token = await sign('client@example.com');
  const res = await worker.fetch(req('/api/click?c=cmp_test&e=client%40example.com&t=' + token + '&u=' + encodeURIComponent('https://lumidermaesthetics.com/pages/booking.html')), e);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://lumidermaesthetics.com/pages/booking.html');
  assert.equal(e.SUBSCRIBERS.campaignEvents[0].event_type, 'click');
});

test('media upload rejects SVG files', async () => {
  const e = env();
  e.MEDIA = new MockR2();
  const form = new FormData();
  form.set('file', new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'xss.svg');

  const res = await worker.fetch(req('/admin/api/media/upload', {
    method: 'POST',
    headers: adminHeaders,
    body: form,
  }), e);

  assert.equal(res.status, 400);
  assert.match((await json(res)).error, /SVG is not allowed/i);
  assert.equal(e.MEDIA.objects.size, 0);
});

test('media responses set nosniff and a restrictive CSP', async () => {
  const e = { MEDIA: new MockR2() };
  await e.MEDIA.put(
    'uploads/existing.svg',
    new TextEncoder().encode('<svg><script>alert(1)</script></svg>'),
    { httpMetadata: { contentType: 'image/svg+xml', cacheControl: 'public, max-age=31536000, immutable' } },
  );

  const res = await worker.fetch(req('/media/uploads/existing.svg'), e);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/svg+xml');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.match(res.headers.get('content-security-policy') || '', /script-src 'none'/);
  assert.match(res.headers.get('content-security-policy') || '', /sandbox/);
});

test('services page fails closed when the D1 price fragment is missing', async () => {
  const e = env();
  e.ASSETS = assetsFromMap({
    '/pages/services.html': '<main><!-- PRICES:START -->STALE PRICE LIST<!-- PRICES:END --></main>',
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(req('/pages/services.html'), e);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '300');
    const body = await res.text();
    assert.match(body, /Prices unavailable/);
    assert.doesNotMatch(body, /STALE PRICE LIST/);
  } finally {
    console.error = originalError;
  }
});

test('services page injects D1 prices instead of static checked-in prices', async () => {
  const e = env();
  e.ASSETS = assetsFromMap({
    '/pages/services.html': '<main><!-- PRICES:START -->STALE PRICE LIST<!-- PRICES:END --></main>',
  });
  e.SUBSCRIBERS.siteContent.set('frag:PRICES', '<section>LIVE D1 PRICE LIST</section>');

  const res = await worker.fetch(req('/pages/services.html'), e);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /LIVE D1 PRICE LIST/);
  assert.doesNotMatch(body, /STALE PRICE LIST/);
});

test('admin content endpoint does not fall back to checked-in prices JSON', async () => {
  const e = env();
  e.ASSETS = assetsFromMap({
    '/assets/data/content.json': '{"site":{"name":"Lumi Derm"}}',
    '/assets/data/prices.json': '{"groups":[{"title":"STALE JSON PRICES"}]}',
  });

  const res = await worker.fetch(req('/admin/api/content', { headers: adminHeaders }), e);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.ok, true);
  assert.equal(body.content.site.name, 'Lumi Derm');
  assert.equal(body.prices, null);
  assert.equal(body.pricesMissing, true);
  assert.match(body.error, /Live prices are missing from D1/i);
  assert.doesNotMatch(JSON.stringify(body), /STALE JSON PRICES/);
});

test('public reviews fall back to static review feed when D1 is not bound', async () => {
  const res = await worker.fetch(req('/api/reviews'), {
    ASSETS: assetsWithReviews(),
  });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.summary.label, 'Treatwell reviews');
  assert.equal(body.reviews.length, 1);
  assert.equal(body.reviews[0].name, 'Elena');
});

test('public reviews fall back to static review feed when D1 review tables are unavailable', async () => {
  const res = await worker.fetch(req('/api/reviews'), {
    ASSETS: assetsWithReviews(),
    SUBSCRIBERS: {
      prepare() {
        throw new Error('no such table: reviews');
      },
    },
  });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.summary.count, 47);
  assert.equal(body.reviews.length, 1);
});

test('scheduled campaign insert/list/cancel routes work', async () => {
  const e = env();
  const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scheduleRes = await worker.fetch(req('/admin/api/campaign/schedule', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: 'Scheduled',
      html: '<p>Hi {{unsubscribe}}</p>',
      recipients: [{ email: 'client@example.com', name: 'Client' }],
      sendAt,
    }),
  }), e);
  assert.equal(scheduleRes.status, 200);
  assert.equal((await json(scheduleRes)).recipients, 1);

  const list = await json(await worker.fetch(req('/admin/api/campaign/scheduled', { headers: adminHeaders }), e));
  assert.equal(list.scheduled[0].status, 'queued');

  const cancel = await worker.fetch(req('/admin/api/campaign/scheduled/cancel', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ id: list.scheduled[0].id }),
  }), e);
  assert.equal(cancel.status, 200);
  assert.equal(e.SUBSCRIBERS.scheduledCampaigns[0].status, 'cancelled');
});

test('scheduled cron marks claimed delivery crashes as error', async () => {
  const e = env();
  delete e.UNSUB_SECRET;
  const due = new Date(Date.now() - 60 * 1000).toISOString();
  e.SUBSCRIBERS.scheduledCampaigns.push({
    id: 1,
    subject: 'Due campaign',
    html: '<p>Hi {{unsubscribe}}</p>',
    audience_source: 'scheduled',
    recipients: JSON.stringify([{ email: 'client@example.com', name: 'Client' }]),
    send_at: due,
    status: 'queued',
    created_at: due,
  });

  const originalError = console.error;
  console.error = () => {};
  try {
    const waits = [];
    worker.scheduled({ scheduledTime: Date.now() }, e, { waitUntil(p) { waits.push(p); } });
    await Promise.all(waits);
  } finally {
    console.error = originalError;
  }

  assert.equal(e.SUBSCRIBERS.scheduledCampaigns[0].status, 'error');
  assert.match(e.SUBSCRIBERS.scheduledCampaigns[0].result, /UNSUB_SECRET is missing/);
  assert.equal(e.SUBSCRIBERS.audit.at(-1).action, 'campaign.schedule.failed');
});

test('scheduled cron holds interrupted sends for review without replaying accepted emails', async () => {
  const e = env();
  const stale = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  e.SUBSCRIBERS.scheduledCampaigns.push({
    id: 1,
    subject: 'Stale campaign',
    html: '<p>Hi {{unsubscribe}}</p>',
    audience_source: 'scheduled',
    recipients: JSON.stringify([{ email: 'client@example.com', name: 'Client' }]),
    send_at: stale,
    status: 'sending',
    created_at: stale,
    result: 'Started by cron at ' + stale,
  });

  const originalFetch = globalThis.fetch;
  let resendCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === 'https://api.resend.com/emails/batch') {
      resendCalls += 1;
      return Response.json([{ id: 'email_1' }]);
    }
    return originalFetch(url);
  };
  try {
    const waits = [];
    worker.scheduled({ scheduledTime: Date.now() }, e, { waitUntil(p) { waits.push(p); } });
    await Promise.all(waits);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(resendCalls, 0);
  assert.equal(e.SUBSCRIBERS.scheduledCampaigns[0].status, 'error');
  assert.match(e.SUBSCRIBERS.scheduledCampaigns[0].result, /Delivery outcome unknown/);
  assert.equal(e.SUBSCRIBERS.audit.some((row) => row.action === 'campaign.schedule.reaper'), true);
});

test('scheduled cron does not requeue a freshly claimed overdue campaign', async () => {
  const e = env();
  const oldSendAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const freshClaim = new Date().toISOString();
  e.SUBSCRIBERS.scheduledCampaigns.push({
    id: 1,
    subject: 'Fresh claim',
    html: '<p>Hi {{unsubscribe}}</p>',
    audience_source: 'scheduled',
    recipients: JSON.stringify([{ email: 'client@example.com', name: 'Client' }]),
    send_at: oldSendAt,
    status: 'sending',
    created_at: oldSendAt,
    result: 'Started by cron at ' + freshClaim,
  });

  const waits = [];
  worker.scheduled({ scheduledTime: Date.now() }, e, { waitUntil(p) { waits.push(p); } });
  await Promise.all(waits);

  assert.equal(e.SUBSCRIBERS.scheduledCampaigns[0].status, 'sending');
  assert.equal(e.SUBSCRIBERS.audit.some((row) => row.action === 'campaign.schedule.reaper'), false);
});

test('scheduled cron logs and rejects top-level job failures', async () => {
  const e = env();
  e.SUBSCRIBERS.failScheduledRead = true;
  const logged = [];
  const originalError = console.error;
  console.error = (line) => { logged.push(String(line)); };
  try {
    const waits = [];
    worker.scheduled({ scheduledTime: Date.now() }, e, { waitUntil(p) { waits.push(p); } });
    await assert.rejects(Promise.all(waits), /Cron failed: scheduled_campaigns/);
  } finally {
    console.error = originalError;
  }

  assert.match(logged.join('\n'), /cron\.failed/);
  assert.equal(e.SUBSCRIBERS.audit.at(-1).action, 'cron.scheduled_campaigns.failed');
});

test('scheduled cancel handles failed and stale sending campaigns', async () => {
  const e = env();
  const stale = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  e.SUBSCRIBERS.scheduledCampaigns.push(
    { id: 1, subject: 'Failed', recipients: '[]', send_at: stale, status: 'error', created_at: stale },
    { id: 2, subject: 'Stale', recipients: '[]', send_at: stale, status: 'sending', created_at: stale },
  );

  const failed = await worker.fetch(req('/admin/api/campaign/scheduled/cancel', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1 }),
  }), e);
  const staleCancel = await worker.fetch(req('/admin/api/campaign/scheduled/cancel', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 2 }),
  }), e);

  assert.equal(failed.status, 200);
  assert.equal(staleCancel.status, 200);
  assert.equal(e.SUBSCRIBERS.scheduledCampaigns[0].status, 'cancelled');
  assert.equal(e.SUBSCRIBERS.scheduledCampaigns[1].status, 'cancelled');
});

test('birthday settings can be saved and read back', async () => {
  const e = env();
  const save = await worker.fetch(req('/admin/api/settings/birthday', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, subject: 'Happy birthday', hour: 9, mail: { headline: 'Hi {{name}}' } }),
  }), e);
  assert.equal(save.status, 200);

  const read = await json(await worker.fetch(req('/admin/api/settings/birthday', { headers: adminHeaders }), e));
  assert.equal(read.birthday.enabled, true);
  assert.equal(read.birthday.subject, 'Happy birthday');
  assert.equal(read.birthday.hour, 9);
});

function enableBirthdayCron(e, overrides = {}) {
  e.SUBSCRIBERS.settings.set('birthday', JSON.stringify({
    enabled: true,
    hour: 8,
    subject: 'Happy birthday, {{name}}',
    html: '<p>Hi {{name}} {{unsubscribe}}</p>',
    ...overrides,
  }));
}

test('birthday cron does not mark birthday_sent_year when delivery fails', async () => {
  const e = env();
  enableBirthdayCron(e);
  e.SUBSCRIBERS.subscribers.push({
    email: 'client@example.com',
    first_name: 'Client',
    status: 'confirmed',
    consent_email: 1,
    pref_birthday: 1,
    birth_day: 15,
    birth_month: 1,
  });

  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = async (url) => {
    if (String(url) === 'https://api.resend.com/emails/batch') {
      return new Response('resend down', { status: 500 });
    }
    return originalFetch(url);
  };
  console.error = () => {};
  try {
    const waits = [];
    worker.scheduled({ scheduledTime: Date.parse('2026-01-15T09:05:00.000Z') }, e, { waitUntil(p) { waits.push(p); } });
    await assert.rejects(Promise.all(waits), /birthday_emails/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }

  assert.equal(e.SUBSCRIBERS.subscribers[0].birthday_sent_year, undefined);
  assert.equal(e.SUBSCRIBERS.audit.at(-1).action, 'cron.birthday_emails.failed');
});

test('birthday cron catches up after the configured send hour', async () => {
  const e = env();
  enableBirthdayCron(e);
  e.SUBSCRIBERS.subscribers.push({
    email: 'client@example.com',
    first_name: 'Client',
    status: 'confirmed',
    consent_email: 1,
    pref_birthday: 1,
    birth_day: 15,
    birth_month: 1,
  });

  const originalFetch = globalThis.fetch;
  let resendCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === 'https://api.resend.com/emails/batch') {
      resendCalls += 1;
      return Response.json([{ id: 'email_1' }]);
    }
    return originalFetch(url);
  };
  try {
    const early = [];
    worker.scheduled({ scheduledTime: Date.parse('2026-01-15T07:05:00.000Z') }, e, { waitUntil(p) { early.push(p); } });
    await Promise.all(early);

    const catchUp = [];
    worker.scheduled({ scheduledTime: Date.parse('2026-01-15T09:05:00.000Z') }, e, { waitUntil(p) { catchUp.push(p); } });
    await Promise.all(catchUp);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(resendCalls, 1);
  assert.equal(e.SUBSCRIBERS.subscribers[0].birthday_sent_year, 2026);
});

test('birthday cron marks only recipients from successful batches', async () => {
  const e = env();
  enableBirthdayCron(e);
  for (let i = 0; i < 101; i += 1) {
    e.SUBSCRIBERS.subscribers.push({
      email: `birthday${i}@example.com`,
      first_name: `Client ${i}`,
      status: 'confirmed',
      consent_email: 1,
      pref_birthday: 1,
      birth_day: 15,
      birth_month: 1,
    });
  }

  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let resendCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === 'https://api.resend.com/emails/batch') {
      resendCalls += 1;
      return resendCalls === 1
        ? Response.json([{ id: 'email_1' }])
        : new Response('resend down', { status: 500 });
    }
    return originalFetch(url);
  };
  console.error = () => {};
  try {
    const waits = [];
    worker.scheduled({ scheduledTime: Date.parse('2026-01-15T09:05:00.000Z') }, e, { waitUntil(p) { waits.push(p); } });
    await assert.rejects(Promise.all(waits), /birthday_emails/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }

  assert.equal(resendCalls, 2);
  assert.equal(e.SUBSCRIBERS.subscribers.slice(0, 100).every((row) => row.birthday_sent_year === 2026), true);
  assert.equal(e.SUBSCRIBERS.subscribers[100].birthday_sent_year, undefined);
});

function testLondonParts(date = new Date()) {
  const parts = new globalThis.Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const map = {};
  parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = Number(p.value); });
  return map;
}

test('birthday dashboard hides paused and birthday-opted-out subscribers', async () => {
  const e = env();
  const today = testLondonParts();
  e.SUBSCRIBERS.subscribers.push(
    { email: 'active@example.com', first_name: 'Active', status: 'confirmed', consent_email: 1, pref_birthday: 1, birth_day: today.day, birth_month: today.month },
    { email: 'optout@example.com', first_name: 'Optout', status: 'confirmed', consent_email: 1, pref_birthday: 0, birth_day: today.day, birth_month: today.month },
    { email: 'paused@example.com', first_name: 'Paused', status: 'confirmed', consent_email: 1, pref_birthday: 1, pause_until: '2999-01-01T00:00:00.000Z', birth_day: today.day, birth_month: today.month },
  );

  const res = await worker.fetch(req('/admin/api/birthdays', { headers: adminHeaders }), e);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.deepEqual(body.birthdays.map((b) => b.email), ['active@example.com']);
  assert.equal(body.today, 1);
});

test('manual birthday send respects birthday preference and pause settings', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push(
    { email: 'optout@example.com', first_name: 'Optout', status: 'confirmed', consent_email: 1, pref_birthday: 0 },
    { email: 'paused@example.com', first_name: 'Paused', status: 'confirmed', consent_email: 1, pref_birthday: 1, pause_until: '2999-01-01T00:00:00.000Z' },
  );

  const optout = await worker.fetch(req('/admin/api/birthdays/send', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'optout@example.com' }),
  }), e);
  assert.equal(optout.status, 400);
  assert.match((await json(optout)).error, /opted out of birthday/i);

  const paused = await worker.fetch(req('/admin/api/birthdays/send', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'paused@example.com' }),
  }), e);
  assert.equal(paused.status, 400);
  assert.match((await json(paused)).error, /paused marketing emails/i);
});

function askBody(overrides = {}) {
  return JSON.stringify({
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '',
    treatment: '',
    question: 'Do you offer packages for laser?',
    company: '',
    ...overrides,
  });
}
const jsonHeaders = { 'content-type': 'application/json' };

test('ask form: honeypot silently succeeds without emailing', async () => {
  const res = await worker.fetch(req('/api/ask', { method: 'POST', headers: jsonHeaders, body: askBody({ company: 'bot-filled' }) }), env());
  assert.equal(res.status, 200);
  const p = await json(res);
  assert.equal(p.ok, true);
});

test('ask form: validates name, email and question', async () => {
  const e = env();
  const noName = await worker.fetch(req('/api/ask', { method: 'POST', headers: jsonHeaders, body: askBody({ name: '' }) }), e);
  assert.equal(noName.status, 400);
  const badEmail = await worker.fetch(req('/api/ask', { method: 'POST', headers: jsonHeaders, body: askBody({ email: 'nope' }) }), e);
  assert.equal(badEmail.status, 400);
  const shortQ = await worker.fetch(req('/api/ask', { method: 'POST', headers: jsonHeaders, body: askBody({ question: 'hi' }) }), e);
  assert.equal(shortQ.status, 400);
});

test('ask form: accepts a valid question (no mailer configured)', async () => {
  // No RESEND_API_KEY -> takes the graceful no-mailer path, so no network call.
  const res = await worker.fetch(req('/api/ask', { method: 'POST', headers: jsonHeaders, body: askBody() }), { SUBSCRIBERS: new MockD1() });
  assert.equal(res.status, 200);
  const p = await json(res);
  assert.equal(p.ok, true);
  assert.match(p.message, /received|reply|touch/i);
});

test('ask form: rejects non-POST', async () => {
  const res = await worker.fetch(req('/api/ask', { headers: jsonHeaders }), env());
  assert.equal(res.status, 405);
});

test('RFC 8058 multipart unsubscribe is accepted', async () => {
  const e = env();
  const email = 'multipart@example.com';
  const body = new FormData();
  body.set('List-Unsubscribe', 'One-Click');
  const token = await sign(email);
  const res = await worker.fetch(req('/api/unsubscribe?e=' + email + '&t=' + token, { method: 'POST', body }), e);
  assert.equal(res.status, 200);
  assert.equal(e.SUPPRESSION.map.size, 1);
});

test('a failed erasure rolls back D1 records together', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push({ email: 'erase@example.com' });
  e.SUBSCRIBERS.campaignEvents.push({ email: 'erase@example.com' });
  e.SUBSCRIBERS.failErase = true;
  await assert.rejects(worker.fetch(req('/admin/api/subscribers/delete', {
    method: 'POST', headers: { ...adminHeaders, ...jsonHeaders }, body: JSON.stringify({ email: 'erase@example.com' }),
  }), e), /erasure write failed/);
  assert.equal(e.SUBSCRIBERS.subscribers.length, 1);
  assert.equal(e.SUBSCRIBERS.campaignEvents.length, 1);
});

test('suppression cleanup resumes after an erasure KV outage', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push({ email: 'erase@example.com' });
  e.SUPPRESSION.map.set('unsub:erase@example.com', 'suppressed');
  e.SUPPRESSION.failDelete = true;
  await assert.rejects(worker.fetch(req('/admin/api/subscribers/delete', {
    method: 'POST', headers: { ...adminHeaders, ...jsonHeaders }, body: JSON.stringify({ email: 'erase@example.com' }),
  }), e), /KV unavailable/);
  assert.equal(e.SUBSCRIBERS.subscribers.length, 0);
  assert.equal(e.SUBSCRIBERS.settings.get('erasure:erase@example.com'), 'erase@example.com');
  e.SUPPRESSION.failDelete = false;
  const waits = [];
  worker.scheduled({ scheduledTime: Date.now() }, e, { waitUntil(p) { waits.push(p); } });
  await Promise.all(waits);
  assert.equal(e.SUBSCRIBERS.settings.has('erasure:erase@example.com'), false);
  assert.equal(e.SUPPRESSION.map.size, 0);
});

test('birthday catch-up retains accepted batches and holds unknown deliveries', async () => {
  const e = env();
  enableBirthdayCron(e);
  for (let i = 0; i < 101; i++) e.SUBSCRIBERS.subscribers.push({
    email: `network${i}@example.com`, first_name: 'Client', status: 'confirmed', consent_email: 1,
    pref_birthday: 1, birth_day: 15, birth_month: 1,
  });
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let calls = 0;
  const accepted = [];
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.resend.com/emails/batch') return originalFetch(url, options);
    if (++calls === 2) throw new Error('network disconnected');
    accepted.push(...JSON.parse(options.body).flatMap(message => message.to));
    return Response.json({ data: [] });
  };
  console.error = () => {};
  try {
    const first = [];
    worker.scheduled({ scheduledTime: Date.parse('2026-01-15T09:05:00Z') }, e, { waitUntil(p) { first.push(p); } });
    await assert.rejects(Promise.all(first), /birthday_emails/);
    assert.equal(e.SUBSCRIBERS.subscribers.filter(row => row.birthday_sent_year === 2026).length, 100);
    assert.equal(e.SUBSCRIBERS.settings.has('birthday-delivery:2026:network100@example.com'), true);
    const retry = [];
    worker.scheduled({ scheduledTime: Date.parse('2026-01-15T10:05:00Z') }, e, { waitUntil(p) { retry.push(p); } });
    await Promise.all(retry);
    assert.equal(calls, 2);
    assert.equal(accepted.length, 100);
    assert.equal(new Set(accepted).size, 100);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test('live prices ignore static validators when database content changes', async () => {
  const e = env();
  e.ASSETS = { async fetch(request) {
    assert.equal(request.headers.get('if-none-match'), null);
    assert.equal(request.headers.get('if-modified-since'), null);
    return new Response('<!-- PRICES:START --><!-- PRICES:END -->', { headers: {
      'content-type': 'text/html', etag: '"static-template"', 'last-modified': 'Mon, 17 Aug 2026 00:00:00 GMT',
    } });
  } };
  for (const price of ['£70', '£80']) {
    e.SUBSCRIBERS.siteContent.set('frag:PRICES', '<p>' + price + '</p>');
    const res = await worker.fetch(req('/pages/services', { headers: {
      'if-none-match': '"static-template"', 'if-modified-since': 'Mon, 17 Aug 2026 00:00:00 GMT',
    } }), e);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('etag'), null);
    assert.equal(res.headers.get('last-modified'), null);
    assert.equal(res.headers.get('cache-control'), 'no-store, must-revalidate');
    assert.ok((await res.text()).includes(price));
  }
});
