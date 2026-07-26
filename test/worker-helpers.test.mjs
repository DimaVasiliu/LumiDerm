import assert from 'node:assert/strict';
import test from 'node:test';

import {
  safeCampaignTarget,
  isApprovedCampaignHost,
  topicColumn,
  clampInt,
  isEmail,
} from '../src/worker.js';

const ORIGIN = 'https://lumidermaesthetics.com';

test('safeCampaignTarget: approves the clinic site + booking', () => {
  assert.equal(
    safeCampaignTarget('https://lumidermaesthetics.com/pages/booking.html', ORIGIN),
    'https://lumidermaesthetics.com/pages/booking.html',
  );
});

test('safeCampaignTarget: approves Treatwell and social channels', () => {
  for (const url of [
    'https://www.treatwell.co.uk/place/lumi/',
    'https://www.instagram.com/lumi.derm.aesthetic/',
    'https://facebook.com/LumiDerm',
    'https://wa.me/447832839298',
  ]) {
    assert.ok(safeCampaignTarget(url, ORIGIN), `should approve ${url}`);
  }
});

test('safeCampaignTarget: returns null for unapproved domains (never homepage)', () => {
  assert.equal(safeCampaignTarget('https://evil.example.com/phish', ORIGIN), null);
});

test('safeCampaignTarget: rejects non-http schemes (anti-XSS)', () => {
  assert.equal(safeCampaignTarget('javascript:alert(1)', ORIGIN), null);
  assert.equal(safeCampaignTarget('data:text/html,<script>', ORIGIN), null);
});

test('isApprovedCampaignHost: matches subdomains of approved domains', () => {
  assert.equal(isApprovedCampaignHost('m.facebook.com'), true);
  assert.equal(isApprovedCampaignHost('www.instagram.com'), true);
  assert.equal(isApprovedCampaignHost('phishinstagram.com'), false); // not a subdomain
  assert.equal(isApprovedCampaignHost('evil.com'), false);
});

test('topicColumn: maps known topics, null otherwise', () => {
  assert.equal(topicColumn('offers'), 'pref_offers');
  assert.equal(topicColumn('skintips'), 'pref_skintips');
  assert.equal(topicColumn('news'), 'pref_news');
  assert.equal(topicColumn('birthday'), 'pref_birthday');
  assert.equal(topicColumn('unknown'), null);
  assert.equal(topicColumn(''), null);
});

test('clampInt: clamps to range or returns null', () => {
  assert.equal(clampInt('3', 1, 5), 3);
  assert.equal(clampInt(0, 1, 5), null);
  assert.equal(clampInt(6, 1, 5), null);
  assert.equal(clampInt('x', 1, 5), null);
});

test('isEmail: basic validation', () => {
  assert.equal(isEmail('a@b.co'), true);
  assert.equal(isEmail('no-at-sign'), false);
  assert.equal(isEmail('a@b'), false);
});
