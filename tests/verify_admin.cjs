// Clicks through /admin the way an editor would: NODE_PATH=<folder with playwright> node tests/verify_admin.cjs
// Runs against tests/admin_harness.cjs, so nothing touches GitHub, Vercel or Anthropic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('./admin_harness.cjs');

const PHOTO = path.resolve(__dirname, '..', 'images', 'hero.jpg');
const ARTICLE = '## 第一部分\n这是第一段内容。\n这是第二段内容。\n- 一个要点\n- 另一个要点\n\n## 第二部分\n最后一段。';

const filesIn = (folder, ...parts) => {
  const directory = path.join(folder, ...parts);
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
};
const readRecord = (folder, slug) => JSON.parse(fs.readFileSync(path.join(folder, 'content', 'insights', `${slug}.json`), 'utf8'));

(async () => {
  const site = await start();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: site.url, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => { if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(`CSP: ${message.text()}`); });
    page.on('dialog', async (dialog) => { problems.push(`unexpected browser dialog: ${dialog.message()}`); await dialog.dismiss(); });

    // ---- sign in ----
    const adminResponse = await page.goto('/admin/');
    const policy = adminResponse.headers()['content-security-policy'];
    assert.match(policy, /default-src 'none'/);
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
    assert.match(adminResponse.headers()['x-robots-tag'], /noindex/);
    await page.locator('#login-password').waitFor();
    assert.equal(await page.locator('#dashboard-view').isHidden(), true, 'nothing is shown before signing in');
    await page.locator('#login-password').fill('wrong-password');
    await page.locator('#login-button').click();
    await page.locator('#login-error').waitFor();
    assert.match(await page.locator('#login-error').innerText(), /密码不正确/);
    await page.locator('#login-password').fill(site.password);
    await page.locator('#login-button').click();
    await page.locator('#empty-state').waitFor();
    assert.equal(await page.locator('.article-row').count(), 0);
    await page.reload();
    await page.locator('#new-article-button').waitFor();
    console.log('PASS: wrong password refused, right password signs in and the session survives a reload');

    // ---- publish ----
    await page.locator('#new-article-button').click();
    await page.locator('#editor-submit').click();
    assert.match(await page.locator('#form-error').innerText(), /标题/);
    await page.locator('#field-title').fill('<img src=x onerror=alert(1)>真实的工作场景');
    await page.locator('#field-title').press('Enter');
    assert.equal(await page.locator('#editor-dialog').evaluate((dialog) => dialog.open), true, 'Enter in a one-line box does not publish');
    // Formatted text (Word, Google Docs, ChatGPT) is converted when pasted; plain text is left to the browser.
    const pasted = await page.locator('#field-content').evaluate((field) => {
      field.focus();
      const send = (data) => {
        const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
        field.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const rich = new DataTransfer();
      rich.setData('text/html', '<h2>大标题</h2><p><b>小标题:</b></p><ul><li>要点</li></ul>');
      rich.setData('text/plain', '大标题 小标题 要点');
      const plain = new DataTransfer();
      plain.setData('text/plain', '只是文字');
      return { richHandled: send(rich), value: field.value, plainHandled: send(plain) };
    });
    assert.equal(pasted.richHandled, true);
    assert.equal(pasted.value, '## 大标题\n\n### 小标题\n\n- 要点');
    assert.equal(pasted.plainHandled, false, 'a plain-text paste is not interfered with');
    assert.match(await page.locator('#form-notice').innerText(), /已按格式转换/);
    await page.locator('#field-content').fill(ARTICLE);
    assert.equal(await page.locator('#address-preview').innerText(), '……', 'no address until there is a title and an article');
    // The English web address fills in by itself, without pressing any button, once the title and article are there.
    await page.locator('#field-title').click();
    await page.waitForFunction(() => document.getElementById('field-slug').value !== '');
    assert.equal(await page.locator('#field-slug').inputValue(), 'auto-suggested-address');
    assert.equal(await page.locator('#address-preview').innerText(), 'auto-suggested-address', 'the address is shown under the title');
    assert.match(await page.locator('#field-summary').inputValue(), /^自动摘要：/, 'the empty summary is filled in too');
    await page.locator('#editor-submit').click();
    assert.match(await page.locator('#form-error').innerText(), /图片/);

    await page.locator('#photo-input').setInputFiles(PHOTO);
    await page.locator('#photo-preview img').waitFor();
    assert.match(await page.locator('#photo-status').innerText(), /已选择：hero\.jpg/);

    await page.locator('#suggest-button').click();
    await page.waitForFunction(() => document.getElementById('field-summary').value !== '');
    assert.match(await page.locator('#field-summary').inputValue(), /^自动摘要：/);
    assert.equal(await page.locator('#field-slug').inputValue(), 'auto-suggested-address');
    assert.equal(await page.locator('#address-preview').innerText(), 'auto-suggested-address');
    assert.equal(await page.locator('#optional-fields').evaluate((details) => details.open), true);
    await page.locator('#editor-submit').click();
    await page.locator('#banner').waitFor();
    assert.match(await page.locator('#banner').innerText(), /已发布.*1 分钟/);
    // This test server does not serve the new photo files (the real site only has them after its rebuild).
    await page.locator('.article-thumb', { hasText: '图片稍后显示' }).waitFor();
    assert.equal(await page.locator('.article-thumb img').count(), 0, 'a missing picture leaves no broken-image icon behind');
    assert.equal(await page.locator('.article-row').count(), 1);
    assert.equal(await page.locator('.article-title').innerText(), '<img src=x onerror=alert(1)>真实的工作场景', 'titles are shown as text, never as HTML');
    assert.equal(await page.locator('.article-row img[onerror]').count(), 0);

    assert.deepEqual(filesIn(site.folder, 'content', 'insights'), ['auto-suggested-address.json']);
    const images = filesIn(site.folder, 'images', 'insights');
    assert.equal(images.length, 2);
    assert.ok(images.every((name) => /^auto-suggested-address(-640)?\.(webp|jpg)$/.test(name)), images.join(','));
    const record = readRecord(site.folder, 'auto-suggested-address');
    assert.equal(record.title, '<img src=x onerror=alert(1)>真实的工作场景');
    assert.equal(record.body, ARTICLE);
    assert.equal(record.summary, '自动摘要：<img src=x onerror=alert(1)>真实的工作场景');
    assert.ok(record.image.width <= 1600 && record.image.width > 0);
    const [fullName, smallName] = [images.find((n) => !n.includes('-640')), images.find((n) => n.includes('-640'))];
    const fullSize = fs.statSync(path.join(site.folder, 'images', 'insights', fullName)).size;
    const smallSize = fs.statSync(path.join(site.folder, 'images', 'insights', smallName)).size;
    assert.ok(smallSize < fullSize && fullSize < 1.6 * 1024 * 1024, `photo sizes ${smallSize}/${fullSize}`);
    assert.match(fs.readFileSync(path.join(site.folder, 'commits.log'), 'utf8'), /chore: publish insight auto-suggested-address/);
    console.log('PASS: new article validated, photo resized in the browser, suggestions filled, published as one commit, shown safely');

    // ---- edit ----
    await page.locator('.edit-button').click();
    await page.waitForFunction(() => document.getElementById('field-title').value !== '');
    assert.equal(await page.locator('#editor-title').innerText(), '编辑文章');
    assert.equal(await page.locator('#field-content').inputValue(), ARTICLE);
    assert.equal(await page.locator('#field-slug').getAttribute('readonly'), '');
    assert.equal(await page.locator('#photo-preview').isVisible(), true, 'the current photo (or its "coming soon" note) is shown');
    await page.locator('#field-title').fill('改过的标题');
    await page.locator('#editor-submit').click();
    await page.locator('#banner').filter({ hasText: '已保存' }).waitFor();
    assert.equal(await page.locator('.article-title').innerText(), '改过的标题');
    const edited = readRecord(site.folder, 'auto-suggested-address');
    assert.equal(edited.title, '改过的标题');
    assert.equal(edited.published, record.published);
    assert.deepEqual(filesIn(site.folder, 'images', 'insights'), images, 'photos untouched when none was chosen');
    console.log('PASS: editing keeps the address, date and photo, and saves the change');

    // ---- closing with unsaved work asks first ----
    await page.locator('#new-article-button').click();
    await page.locator('#field-title').fill('还没写完');
    // An address someone typed by hand is never replaced by the automatic one.
    await page.locator('#optional-fields summary').click();
    await page.locator('#field-slug').fill('my-own-address');
    await page.locator('#field-content').fill('内容');
    await page.locator('#field-title').click();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#field-slug').inputValue(), 'my-own-address', 'a hand-typed address is kept');
    page.removeAllListeners('dialog');
    let asked = '';
    page.once('dialog', async (dialog) => { asked = dialog.message(); await dialog.dismiss(); });
    await page.locator('#editor-cancel').click();
    assert.match(asked, /内容会丢失/);
    assert.equal(await page.locator('#editor-dialog').evaluate((dialog) => dialog.open), true, 'staying keeps the work');
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#editor-cancel').click();
    await page.waitForFunction(() => !document.getElementById('editor-dialog').open);
    page.on('dialog', async (dialog) => { problems.push(`unexpected browser dialog: ${dialog.message()}`); await dialog.dismiss(); });
    console.log('PASS: closing a half-written article asks before throwing it away');

    // ---- narrow screen ----
    await page.setViewportSize({ width: 390, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `no sideways scrolling on a phone (${overflow}px)`);
    await page.locator('.edit-button').click();
    await page.waitForFunction(() => document.getElementById('field-title').value !== '');
    const box = await page.locator('#editor-dialog').boundingBox();
    assert.ok(box.width <= 390 && box.x >= 0, 'the editor fits a phone screen');
    await page.locator('#editor-cancel').click();
    await page.setViewportSize({ width: 1280, height: 900 });
    console.log('PASS: list and editor fit a phone screen');

    // ---- delete ----
    await page.locator('.delete-button').click();
    assert.match(await page.locator('#delete-message').innerText(), /改过的标题.*无法恢复/);
    await page.locator('#delete-cancel').click();
    assert.equal(await page.locator('.article-row').count(), 1, 'not deleted when cancelled');
    await page.locator('.delete-button').click();
    await page.locator('#delete-confirm').click();
    await page.locator('#empty-state').waitFor();
    assert.deepEqual(filesIn(site.folder, 'content', 'insights'), []);
    assert.deepEqual(filesIn(site.folder, 'images', 'insights'), []);
    console.log('PASS: delete asks first, then removes the article and its photos');

    // ---- session ends ----
    await context.clearCookies();
    await page.locator('#new-article-button').click();
    await page.locator('#field-title').fill('登录过期后');
    await page.locator('#field-content').fill('正文');
    await page.locator('#photo-input').setInputFiles(PHOTO);
    await page.locator('#photo-preview img').waitFor();
    await page.locator('#editor-submit').click();
    await page.locator('#login-error').filter({ hasText: '登录已过期' }).waitFor();
    assert.equal(await page.locator('#editor-dialog').evaluate((dialog) => dialog.open), false);
    await page.locator('#login-password').fill(site.password);
    await page.locator('#login-button').click();
    await page.locator('#logout-button').click();
    await page.locator('#login-password').waitFor();
    assert.equal(await page.locator('#dashboard-view').isHidden(), true);
    await page.reload();
    await page.locator('#login-password').waitFor();
    console.log('PASS: an expired session returns to the sign-in page; signing out locks the page again');

    assert.deepEqual(problems, [], 'no script errors or surprise dialogs');
    console.log('All /admin checks passed.');
  } finally {
    await browser.close();
    await site.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
