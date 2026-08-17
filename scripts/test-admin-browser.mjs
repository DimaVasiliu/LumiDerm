import assert from 'node:assert/strict';
/* global document */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8787';
const chromePath =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outputDirectory = '/private/tmp/lumiderm-admin-screenshots';
const widths = [390, 768, 1280, 1600];
const tabs = [
  ['dashboard', 'Overview'],
  ['guide', 'Guide & help'],
  ['offers', 'Offers'],
  ['prices', 'Prices'],
  ['treatments', 'Treatment cards'],
  ['sender', 'Send email'],
  ['subscribers', 'Subscribers'],
  ['reviews', 'Reviews'],
  ['media', 'Media'],
  ['content', 'Pages'],
  ['clients', 'Treatwell'],
  ['settings', 'Settings'],
];

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox'],
});

function apiPayload(url) {
  if (url.endsWith('/admin/api/health')) {
    return { ok: true, adminEmail: 'owner@example.com', resend: true, unsubSecret: true, suppression: true, subscribers: true, github: true, media: true, from: 'Lumi Derm <info@lumidermaesthetics.com>' };
  }
  if (url.includes('/admin/api/github/health')) return { ok: true, configured: true, repo: 'DimaVasiliu/LumiDerm', branch: 'main' };
  if (url.endsWith('/admin/api/subscribers')) {
    return { ok: true, total: 1, counts: { confirmed: 1, pending: 0, unsubscribed: 0 }, subscribers: [{ first_name: 'Sarah', last_name: 'Client', email: 'sarah@example.com', status: 'confirmed', consent_email: 1, consent_source: 'website popup', confirmed_at: '2026-07-21T08:00:00.000Z', birth_day: 12, birth_month: 8, interest: 'Facials & peels' }] };
  }
  if (url.endsWith('/admin/api/campaign/drafts')) return { ok: true, drafts: [] };
  if (url.endsWith('/admin/api/campaign/history')) return { ok: true, history: [] };
  if (url.endsWith('/admin/api/campaign/scheduled')) return { ok: true, scheduled: [] };
  if (url.endsWith('/admin/api/settings/birthday')) return { ok: true, birthday: { enabled: false, subject: 'Happy birthday from Lumi Derm', hour: 8, mail: {} } };
  if (url.endsWith('/admin/api/birthdays')) return { ok: true, today: 0, birthdays: [] };
  if (url.endsWith('/admin/api/audit')) return { ok: true, entries: [] };
  if (url.endsWith('/admin/api/media')) return { ok: true, configured: true, media: [] };
  return { ok: true };
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route('**/admin/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(apiPayload(route.request().url())),
      });
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto(`${baseUrl}/admin/`, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, `admin should return 200 at ${width}px`);
    await page.locator('[data-gate-input]').fill('lumiderm');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.locator('[data-admin-panel="dashboard"]').waitFor();

    for (const [id, label] of tabs) {
      await page.locator(`[data-admin-panel="${id}"]`).click();
      await page.locator(`#${id}.is-active`).waitFor();
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(
        overflow.scrollWidth <= overflow.clientWidth + 1,
        `${label} overflows horizontally at ${width}px (${overflow.scrollWidth}/${overflow.clientWidth})`,
      );
      await page.screenshot({
        path: `${outputDirectory}/${id}-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(pageErrors, [], `admin page errors at ${width}px`);
    await context.close();
  }

  console.log(`Admin visual checks: PASS (${tabs.length} tabs × ${widths.length} widths)`);
  console.log(`Screenshots: ${outputDirectory}`);
} finally {
  await browser.close();
}
