import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/worker.js';

const adminHeaders = { 'cf-access-authenticated-user-email': 'owner@example.com' };

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
  delete(key) { this.map.delete(key); return Promise.resolve(); }
}

class MockD1 {
  constructor() {
    this.subscribers = [];
    this.campaignSends = [];
    this.campaignEvents = [];
    this.scheduledCampaigns = [];
    this.settings = new Map();
    this.audit = [];
    this.nextScheduledId = 1;
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
  _first(sql, args) {
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
    return null;
  }
  _all(sql, args = []) {
    if (/FROM subscribers ORDER BY created_at DESC/.test(sql)) {
      return [...this.subscribers].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
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
    if (/FROM scheduled_campaigns/.test(sql)) return this.scheduledCampaigns.map((row) => ({
      ...row,
      recipient_count: JSON.parse(row.recipients || '[]').length,
    }));
    return [];
  }
  _run(sql, args) {
    if (/Updated in email preference centre/.test(sql)) {
      const [email, firstName, lastName, birthDay, birthMonth, interest, now] = args;
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
        consent_wording: 'Updated in email preference centre',
        consent_source: 'preference centre',
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
      this.subscribers = this.subscribers.filter((s) => s.email !== args[0]);
      return { meta: { changes: before - this.subscribers.length } };
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
    if (/UPDATE scheduled_campaigns SET status='cancelled'/.test(sql)) {
      const row = this.scheduledCampaigns.find((s) => s.id === Number(args[0]) && s.status === 'queued');
      if (row) row.status = 'cancelled';
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (/INSERT INTO app_settings/.test(sql)) {
      this.settings.set('birthday', args[0]);
      return { meta: { changes: 1 } };
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
  return {
    ADMIN_EMAILS: 'owner@example.com',
    SUBSCRIBERS: new MockD1(),
    SUPPRESSION: new MockKV(),
    RESEND_API_KEY: 'test_resend_key',
    UNSUB_SECRET: 'test_secret',
    FROM_EMAIL: 'Lumi Derm <info@lumidermaesthetics.com>',
  };
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

test('campaign send validates required input before delivery', async () => {
  const res = await worker.fetch(req('/admin/api/campaign/send', {
    method: 'POST',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ subject: 'Hello', html: '<p>Hello</p>', recipients: [] }),
  }), env());
  assert.equal(res.status, 400);
  assert.match((await json(res)).error, /No recipients/);
});

test('assistant role cannot send campaigns', async () => {
  const res = await worker.fetch(req('/admin/api/campaign/send', {
    method: 'POST',
    headers: { 'cf-access-authenticated-user-email': 'assistant@example.com', 'content-type': 'application/json' },
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
    headers: { 'cf-access-authenticated-user-email': 'assistant@example.com' },
  }), assistantEnv());
  assert.equal(res.status, 403);
  assert.match((await json(res)).error, /Owner access/i);
});

test('unsubscribe link updates suppression list and D1 status', async () => {
  const e = env();
  e.SUBSCRIBERS.subscribers.push({ email: 'client@example.com', status: 'confirmed', created_at: '2026-07-21T00:00:00.000Z' });
  const token = await sign('client@example.com');
  const res = await worker.fetch(req('/api/unsubscribe?e=client%40example.com&t=' + token), e);
  assert.equal(res.status, 200);
  assert.equal(await e.SUPPRESSION.get('unsub:client@example.com') !== null, true);
  assert.equal(e.SUBSCRIBERS.subscribers[0].status, 'unsubscribed');
});

test('preference centre updates subscriber consent details', async () => {
  const e = env();
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
});

test('tracked campaign click records an event and redirects', async () => {
  const e = env();
  const token = await sign('client@example.com');
  const res = await worker.fetch(req('/api/click?c=cmp_test&e=client%40example.com&t=' + token + '&u=' + encodeURIComponent('https://lumidermaesthetics.com/pages/booking.html')), e);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://lumidermaesthetics.com/pages/booking.html');
  assert.equal(e.SUBSCRIBERS.campaignEvents[0].event_type, 'click');
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
