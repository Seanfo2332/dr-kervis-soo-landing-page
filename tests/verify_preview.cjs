// Regression: a page already open in the browser must update after a local edit.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:8000';
const fixture = path.join(__dirname, '..', 'preview-reload-test.html');

(async () => {
  assert.equal(fs.existsSync(fixture), false, 'The temporary test filename must be unused');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    fs.writeFileSync(fixture, '<!doctype html><html><head><title>Preview test</title></head><body><h1>Before edit</h1></body></html>');
    await page.goto(base + '/preview-reload-test.html');
    assert.equal(await page.locator('h1').innerText(), 'Before edit');
    fs.writeFileSync(fixture, '<!doctype html><html><head><title>Preview test</title></head><body><h1>After edit</h1></body></html>');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'After edit', null, { timeout: 5000 });
    console.log('PASS: an already-open page reloads after a file edit');

    await page.goto(base + '/preview/');
    assert.match(await page.locator('h1').innerText(), /Dr Kervis/);
    assert.equal(new URL(page.url()).pathname, '/preview/');
    assert.equal(await page.locator('.hero-photo').count(), 1);
    console.log('PASS: fresh preview directly displays the rebuilt homepage');

    for (const pathname of ['/preview/', '/landing.html', '/assets/site.css', '/assets/site.js']) {
      const response = await page.request.get(base + pathname, { headers: { 'If-Modified-Since': 'Wed, 31 Dec 2099 23:59:59 GMT' } });
      assert.equal(response.status(), 200, pathname);
      assert.match(response.headers()['cache-control'], /no-store/, pathname);
    }
    console.log('PASS: HTML, CSS and JavaScript bypass stale cached responses');
    const state = await page.request.get(base + '/__preview_version__');
    assert.match((await state.json()).version, /^[a-f0-9]{20}$/);
    console.log('PASS: live-preview version endpoint');
    await page.screenshot({ path: path.join(process.env.TEMP, 'drkervis-preview-fixed.png') });
  } finally {
    await browser.close();
    if (fs.existsSync(fixture)) fs.unlinkSync(fixture);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
