import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8787';
const chromePath =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outputDirectory = '/private/tmp/lumiderm-phase1-screenshots';
const widths = [320, 390, 768, 1024, 1440, 1920];
const pages = [
  ['home', '/'],
  ['services', '/pages/services.html'],
  ['booking', '/pages/booking.html'],
  ['legal', '/pages/policies.html'],
];
const essentialConsent = {
  version: 2,
  timestamp: '2026-06-28T00:00:00.000Z',
  categories: { essential: true, externalMedia: false },
};

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox'],
});

async function createContext(options = {}, externalRequests = []) {
  const context = await browser.newContext(options);
  await context.route('https://**', async (route) => {
    externalRequests.push(route.request().url());
    await route.abort();
  });
  return context;
}

function optionalProviderRequests(requests) {
  return requests.filter((url) => /app\.squareup\.com|www\.google\.com/.test(url));
}

async function setStoredConsent(context, record = essentialConsent) {
  await context.addInitScript((value) => {
    localStorage.setItem('ld-cookie-consent-v2', JSON.stringify(value));
  }, record);
}

try {
  if (process.env.SKIP_VISUAL_MATRIX !== '1') {
    for (const width of widths) {
      for (const [name, path] of pages) {
        const context = await createContext({ viewport: { width, height: 900 } });
        await setStoredConsent(context);
        const page = await context.newPage();
        const pageErrors = [];
        const localRequestFailures = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('requestfailed', (request) => {
          if (request.url().startsWith(baseUrl)) localRequestFailures.push(request.url());
        });
        const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
        assert.equal(response?.status(), 200, `${name} should return 200 at ${width}px`);
        assert.deepEqual(pageErrors, [], `${name} page errors at ${width}px`);
        assert.deepEqual(localRequestFailures, [], `${name} local request failures at ${width}px`);
        const overflow = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        assert.ok(
          overflow.scrollWidth <= overflow.clientWidth + 1,
          `${name} overflows horizontally at ${width}px (${overflow.scrollWidth}/${overflow.clientWidth})`,
        );
        assert.equal(await page.locator('iframe').count(), 0, `${name} should not preload iframes`);
        await page.screenshot({
          path: `${outputDirectory}/${name}-${width}.png`,
          fullPage: true,
        });
        await context.close();
      }
    }

    const notFoundContext = await createContext({ viewport: { width: 390, height: 900 } });
    await setStoredConsent(notFoundContext);
    const notFoundPage = await notFoundContext.newPage();
    const notFoundResponse = await notFoundPage.goto(`${baseUrl}/definitely-missing`, {
      waitUntil: 'networkidle',
    });
    assert.equal(notFoundResponse?.status(), 404);
    assert.equal(
      await notFoundPage.getByRole('heading', { level: 1 }).textContent(),
      "We couldn't find that page",
    );
    await notFoundPage.screenshot({
      path: `${outputDirectory}/not-found-390.png`,
      fullPage: true,
    });
    await notFoundContext.close();
  }

  const providerRequests = [];
  const consentContext = await createContext(
    { viewport: { width: 390, height: 900 } },
    providerRequests,
  );
  const consentPage = await consentContext.newPage();
  await consentPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  assert.deepEqual(
    optionalProviderRequests(providerRequests),
    [],
    'optional providers must not be requested before a choice',
  );
  await consentPage.getByRole('button', { name: 'Essential only' }).click();
  const essentialRecord = await consentPage.evaluate(() =>
    JSON.parse(localStorage.getItem('ld-cookie-consent-v2')),
  );
  assert.equal(essentialRecord.version, 2);
  assert.equal(essentialRecord.categories.externalMedia, false);
  assert.deepEqual(
    optionalProviderRequests(providerRequests),
    [],
    'Essential only must keep optional providers blocked',
  );
  await consentPage.getByRole('button', { name: 'Cookie settings' }).click();
  await consentPage.getByRole('button', { name: 'Allow external media' }).click();
  const mapFrame = consentPage.locator('iframe[title^="Map to Lumi Derm"]');
  await mapFrame.waitFor();
  assert.match(await mapFrame.getAttribute('src'), /^https:\/\/www\.google\.com\/maps/);
  const allRecord = await consentPage.evaluate(() =>
    JSON.parse(localStorage.getItem('ld-cookie-consent-v2')),
  );
  assert.equal(allRecord.categories.externalMedia, true);
  await consentPage.getByRole('button', { name: 'Cookie settings' }).click();
  await consentPage.getByRole('button', { name: 'Essential only' }).click();
  assert.equal(await consentPage.locator('iframe').count(), 0);
  await consentContext.close();

  const bookingRequests = [];
  const bookingContext = await createContext(
    { viewport: { width: 390, height: 900 } },
    bookingRequests,
  );
  const bookingPage = await bookingContext.newPage();
  await bookingPage.goto(`${baseUrl}/pages/booking.html`, { waitUntil: 'networkidle' });
  assert.deepEqual(optionalProviderRequests(bookingRequests), []);
  await bookingPage.getByRole('button', { name: 'Load booking once' }).click();
  const squareFrame = bookingPage.locator('iframe[title^="Book a Lumi Derm"]');
  await squareFrame.waitFor();
  assert.equal(
    await bookingPage.evaluate(() => localStorage.getItem('ld-cookie-consent-v2')),
    null,
  );
  assert.match(await squareFrame.getAttribute('src'), /^https:\/\/app\.squareup\.com\//);
  await bookingContext.close();

  const interactionContext = await createContext({ viewport: { width: 390, height: 900 } });
  await setStoredConsent(interactionContext);
  const interactionPage = await interactionContext.newPage();
  await interactionPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });

  await interactionPage.keyboard.press('Tab');
  assert.equal(
    await interactionPage.evaluate(() => document.activeElement?.className),
    'skip-link',
  );
  await interactionPage.keyboard.press('Enter');
  assert.equal(await interactionPage.evaluate(() => document.activeElement?.id), 'main-content');

  const mobileToggle = interactionPage.getByRole('button', { name: 'Toggle navigation' });
  await mobileToggle.click();
  assert.equal(await mobileToggle.getAttribute('aria-expanded'), 'true');
  await interactionPage.keyboard.press('Escape');
  assert.equal(await mobileToggle.getAttribute('aria-expanded'), 'false');

  const clones = interactionPage.locator('.offer-slide.is-clone');
  assert.ok((await clones.count()) > 0);
  for (let index = 0; index < (await clones.count()); index += 1) {
    const clone = clones.nth(index);
    assert.equal(await clone.getAttribute('aria-hidden'), 'true');
    assert.equal(await clone.getAttribute('inert'), '');
    assert.equal(
      await clone
        .locator('a, button, input, select, textarea')
        .evaluateAll((items) => items.every((item) => item.tabIndex === -1)),
      true,
    );
  }
  const carousel = interactionPage.locator('[data-offers-carousel]');
  await carousel.focus();
  await interactionPage.keyboard.press('ArrowRight');
  await interactionPage.getByText(/Offer \d+ of 13/).waitFor();
  const pause = interactionPage.locator('.carousel-pause');
  assert.equal(await pause.textContent(), 'Pause rotation');
  await pause.click();
  assert.equal(await pause.getAttribute('aria-pressed'), 'true');

  await interactionPage.getByRole('button', { name: 'Read reviews' }).click();
  await interactionPage.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'Close client reviews',
  );
  assert.equal(
    await interactionPage.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'Close client reviews',
  );
  await interactionPage.keyboard.press('Escape');
  assert.equal(
    await interactionPage.evaluate(() => document.activeElement?.textContent?.trim()),
    'Read reviews',
  );
  assert.match(
    await interactionPage.locator('[data-reviews-summary] small').textContent(),
    /15 reviews/,
  );

  const firstPrice = interactionPage.locator('.price-card').first();
  await firstPrice.focus();
  await interactionPage.keyboard.press('Enter');
  const openPriceModal = interactionPage.locator('.price-modal[aria-hidden="false"]');
  await openPriceModal.waitFor();
  await interactionPage.waitForFunction(() =>
    document.activeElement?.classList.contains('price-modal-close'),
  );
  assert.equal(
    await interactionPage.evaluate(() =>
      document.activeElement?.classList.contains('price-modal-close'),
    ),
    true,
  );
  await interactionPage.keyboard.press('Escape');
  assert.equal(
    await interactionPage.evaluate(() => document.activeElement?.classList.contains('price-card')),
    true,
  );
  await interactionContext.close();

  const reducedContext = await createContext({
    viewport: { width: 390, height: 900 },
    reducedMotion: 'reduce',
  });
  await setStoredConsent(reducedContext);
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  assert.equal(
    await reducedPage.getByRole('button', { name: 'Resume rotation' }).getAttribute('aria-pressed'),
    'true',
  );
  await reducedContext.close();

  if (process.env.SKIP_VISUAL_MATRIX === '1') {
    console.log('Visual matrix: skipped for focused interaction run');
  } else {
    console.log(`Browser matrix: PASS (${pages.length} pages × ${widths.length} widths)`);
  }
  console.log(
    'Consent, keyboard, carousel, modal, mobile navigation, and reduced-motion checks: PASS',
  );
  console.log(`Screenshots: ${outputDirectory}`);
} finally {
  await browser.close();
}
