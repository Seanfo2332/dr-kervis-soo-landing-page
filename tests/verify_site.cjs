// Run with an existing static server: node tests/verify_site.cjs
// Playwright is used only for verification; the website has no runtime dependencies.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.SITE_URL || 'http://127.0.0.1:8000';
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    // A fresh session retains the animated entrance and its working Enter action.
    await page.goto(`${BASE}/landing.html`);
    await page.waitForURL(`${BASE}/`);
    await page.locator('#enter-btn').click();
    await page.waitForURL(`${BASE}/landing.html`, { timeout: 15000 });
    await page.locator('#hero-title').waitFor();
    assert.match(await page.locator('h1').innerText(), /Dr Kervis/);
    console.log('PASS: fresh-session entrance → homepage');

    // Check every generated page, local asset and link, metadata and schema.
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const routes = [...sitemap.matchAll(/<loc>https:\/\/drkervis\.com([^<]*)<\/loc>/g)].map(match => match[1]).filter(route => route !== '/');
    const internalTargets = new Set();
    for (const route of routes) {
      const response = await page.goto(BASE + route);
      assert.equal(response.status(), 200, route);
      assert.equal(await page.locator('h1').count(), 1, `${route}: one H1`);
      assert.ok(await page.locator('meta[name="description"]').getAttribute('content'), `${route}: description`);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://drkervis.com' + route);
      await page.locator('script[type="application/ld+json"]').evaluate(element => JSON.parse(element.textContent));
      const links = await page.locator('a[href], img[src], script[src], link[rel="stylesheet"], source[src]').evaluateAll(elements => elements.map(element => element.getAttribute('href') || element.getAttribute('src')));
      for (const href of links) {
        if (href.startsWith('/') || href.startsWith('#')) {
          const url = new URL(href, BASE + route);
          internalTargets.add(url.pathname + url.search + url.hash);
        }
      }
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${route}: overflow at ${width}`);
      }
    }
    for (const target of internalTargets) {
      const url = new URL(target, BASE);
      const response = await context.request.get(url.pathname + url.search);
      assert.equal(response.status(), 200, `Broken local target: ${target}`);
      if (url.hash && url.pathname !== '/') {
        const html = await response.text();
        const id = decodeURIComponent(url.hash.substring(1));
        assert.ok(html.includes(`id="${id}"`) || html.includes(`id='${id}'`), `Missing anchor: ${target}`);
      }
    }
    console.log(`PASS: ${routes.length} pages, ${internalTargets.size} local targets, metadata, schema, and mobile/desktop overflow`);

    // Media references keep their original text; category and keyword filters compose.
    await page.goto(`${BASE}/media/`);
    await page.locator('[data-filter="ai"]').click();
    assert.equal(await page.locator('.reference-row:visible').count(), 3);
    await page.getByRole('searchbox').fill('OnAsiaNews');
    assert.equal(await page.locator('.reference-row:visible').count(), 1);
    await page.getByRole('searchbox').fill('no-matching-record-123');
    assert.equal(await page.locator('.reference-row:visible').count(), 0);
    assert.equal(await page.locator('.no-results').isVisible(), true);
    await page.getByRole('searchbox').fill('');
    await page.locator('[data-filter="all"]').click();
    assert.equal(await page.locator('.reference-row:visible').count(), 7);

    await page.goto(`${BASE}/insights/`);
    await page.locator('[data-filter="creators"]').click();
    assert.equal(await page.locator('.insight:visible').count(), 1);
    await page.goto(`${BASE}/archive/`);
    await page.locator('[data-filter="impact"]').click();
    assert.equal(await page.locator('.archive-item:visible').count(), 2);
    console.log('PASS: media, insights and archive filters, keyword search and empty states');

    // Contact invitations preselect the correct intent, validate input, and prepare a real mailto.
    for (const type of ['speaking', 'media']) {
      await page.goto(`${BASE}/contact/?type=${type}`);
      assert.equal(await page.locator('#type').inputValue(), type);
    }
    await page.locator('button[type="submit"]').click();
    assert.equal(await page.locator('.email-ready').isVisible(), false);
    await page.locator('#name').fill('Site QA');
    await page.locator('#email').fill('qa@example.com');
    await page.locator('#organisation').fill('Preview review');
    await page.locator('#message').fill('测试中文 & English + symbols\nSecond line');
    await page.locator('button[type="submit"]').click();
    assert.equal(await page.locator('.email-ready').isVisible(), true);
    const mail = new URL(await page.locator('.email-ready a').getAttribute('href'));
    assert.equal(mail.protocol, 'mailto:');
    assert.equal(mail.pathname, 'Drkervis@xingyu.global');
    assert.match(mail.searchParams.get('subject'), /媒体采访/);
    assert.match(mail.searchParams.get('body'), /测试中文 & English \+ symbols\nSecond line/);
    await page.locator('#message').fill('Updated text');
    assert.equal(await page.locator('.email-ready').isVisible(), false);
    console.log('PASS: contact intent, required fields, email encoding and draft invalidation');

    // Mobile menu closes with Escape and traps keyboard navigation while open.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/landing.html`);
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.mobile-menu').isVisible(), true);
    assert.equal(await page.locator('main').getAttribute('inert'), '');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mobile-menu').isVisible(), false);
    assert.equal(await page.locator('main').getAttribute('inert'), null);
    await page.locator('.menu-toggle').click();
    await page.locator('.mobile-menu a').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.menu-toggle').evaluate(element => element === document.activeElement), true);
    await page.locator('.mobile-menu a[href="/business/"]').click();
    await page.waitForURL(`${BASE}/business/`);
    assert.equal(await page.locator('.mobile-menu').isVisible(), false);
    console.log('PASS: mobile navigation, Escape, focus containment and page navigation');

    await page.goto(`${BASE}/press/`);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('[data-copy="bio-short"]').click();
    await page.waitForFunction(() => document.querySelector('.copy-feedback').textContent.includes('Copied'));
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /苏才育博士/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('a[href="/assets/dr-kervis-biographies.txt"]').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'dr-kervis-biographies.txt');
    console.log('PASS: press biography clipboard and file download');

    // Direct article links and content remain readable without JavaScript.
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const simple = await noJs.newPage();
    await simple.goto(`${BASE}/story/`);
    assert.equal(await simple.locator('h1').isVisible(), true);
    assert.ok(await simple.locator('main').innerText());
    await noJs.close();
    assert.deepEqual(errors, [], 'Unexpected browser exceptions');
    console.log('PASS: no-JavaScript content and zero runtime errors');

    // A failed external animation dependency must not trap visitors at the entrance.
    const fallback = await browser.newContext({ reducedMotion: 'reduce' });
    await fallback.route('https://unpkg.com/**', route => route.abort());
    const fallbackPage = await fallback.newPage();
    await fallbackPage.goto(BASE + '/');
    await fallbackPage.locator('#enter-btn').click();
    await fallbackPage.waitForURL(BASE + '/landing.html');
    assert.equal(await fallbackPage.locator('#hero-title').isVisible(), true);
    await fallback.close();
    console.log('PASS: entrance fallback when the animation CDN is unavailable');

    // Archive review screenshots after lazy images have been loaded.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${BASE}/landing.html`, { waitUntil: 'networkidle' });
    await page.locator('img[loading="lazy"]').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    for (const section of await page.locator('main > section').all()) {
      await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const output = path.join(process.env.TEMP || '/tmp', 'drkervis-review');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'homepage-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, 'homepage-mobile.png'), fullPage: true });
    await page.goto(`${BASE}/contact/?type=speaking`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(output, 'contact-mobile.png'), fullPage: true });
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
