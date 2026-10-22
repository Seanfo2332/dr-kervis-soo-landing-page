// The whole chain, in a throwaway copy of the project: publish in /admin -> run the page generator -> read the live pages.
//   NODE_PATH=<folder with playwright> node tests/verify_publish.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('./admin_harness.cjs');

const source = path.resolve(__dirname, '..');
const SKIP = new Set(['.git', 'node_modules', '.vercel', '__pycache__']);
const TITLE = '<b>真实</b>的工作场景 & 团队';
const BODY = '开场白，没有小标题。\n\n## 先找到问题\n第一段。\n### 一个小标题\n第二段 <script>alert(1)</script>。\n- 要点一\n- 要点二\n## 再选择工具\n结尾一段。';

(async () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'drk-publish-'));
  fs.cpSync(source, copy, { recursive: true, filter: (file) => !SKIP.has(path.basename(file)) });
  const site = await start({ folder: copy, siteRoot: copy });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ baseURL: site.url, viewport: { width: 1280, height: 900 } })).newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('dialog', async (dialog) => { problems.push(`unexpected dialog: ${dialog.message()}`); await dialog.dismiss(); });

    await page.goto('/admin/');
    await page.locator('#login-password').fill(site.password);
    await page.locator('#login-button').click();
    await page.locator('#new-article-button').click();
    await page.locator('#field-title').fill(TITLE);
    await page.locator('#field-content').fill(BODY);
    await page.locator('#photo-input').setInputFiles(path.join(source, 'images', 'hero.jpg'));
    await page.locator('#photo-preview img').waitFor();
    await page.locator('#suggest-button').click();
    await page.waitForFunction(() => document.getElementById('field-slug').value !== '');
    await page.locator('#editor-submit').click();
    await page.locator('#banner').waitFor();
    await page.waitForFunction(() => { const img = document.querySelector('.article-thumb img'); return img && img.complete && img.naturalWidth > 0; });

    const output = execFileSync('python', ['scripts/build_site.py'], { cwd: copy, encoding: 'utf8' });
    assert.match(output, /1 admin-added insights/);
    assert.ok(!output.includes('WARNING'), output);
    console.log('PASS: published in /admin, then the page generator accepted the stored files');

    const slug = 'auto-suggested-address';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());

    // article page
    const response = await page.goto(`/insights/${slug}/`);
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('h1').innerText(), TITLE, 'the title is shown as text');
    assert.equal(await page.locator('main b, main script').count(), 0, 'pasted HTML never becomes real HTML');
    assert.ok((await page.locator('main').innerText()).includes('<script>alert(1)</script>'), 'pasted markup is shown as plain text');
    assert.deepEqual(await page.locator('.page-aside a').allInnerTexts(), ['先找到问题', '再选择工具'], 'only the big headings are in the reading navigation');
    assert.deepEqual(await page.locator('.prose h3').allInnerTexts(), ['一个小标题'], 'a small heading is a real h3 inside its section');
    assert.equal(await page.locator('.prose section h3').count(), 1);
    assert.equal(await page.locator('.prose .article-list li').count(), 2);
    assert.equal(await page.locator('.prose').first().locator('.article-list').count(), 0, 'bullets sit inside their section');
    assert.ok((await page.locator('.prose').first().innerText()).includes('开场白，没有小标题。'));
    const hero = page.locator('.article-art img');
    await hero.waitFor();
    assert.ok(await hero.evaluate((img) => img.complete && img.naturalWidth > 0), 'the uploaded photo loads');
    assert.match(await hero.getAttribute('srcset'), /-640\.(webp|jpg) 640w/);
    assert.equal(await hero.getAttribute('fetchpriority'), 'high');
    assert.match(await page.locator('.article-meta').innerText(), new RegExp(`发布于 ${today.replaceAll('-', '\\.')}`));
    const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
    const article = schema['@graph'].find((item) => item['@type'] === 'Article');
    assert.equal(article.headline, TITLE);
    assert.equal(article.datePublished, today);
    assert.match(article.image, new RegExp(`^https://drkervis.com/images/insights/${slug}\\.(webp|jpg)$`));
    assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /^搜索描述：/);
    assert.match(await page.locator('meta[property="og:image"]').getAttribute('content'), new RegExp(`/images/insights/${slug}`));
    assert.equal(await page.locator('meta[property="og:type"]').getAttribute('content'), 'article');
    console.log('PASS: article page has safe text, reading navigation, bullets, working photo, and correct structured data');

    // list page
    await page.goto('/insights/');
    assert.equal(await page.locator('[data-filter]').count(), 0, 'no category buttons');
    assert.equal(await page.locator('.insight').count(), 4);
    assert.equal(await page.locator('.insight h3').first().innerText(), TITLE, 'newest article first');
    await page.getByRole('searchbox').fill('的工作场景 & 团队');
    assert.equal(await page.locator('.insight:visible').count(), 1);
    await page.getByRole('searchbox').fill('');
    assert.equal(await page.locator('.insight:visible').count(), 4);
    console.log('PASS: list shows all four articles, newest first, and search finds the new one');

    // home page: newest three only
    await page.goto('/landing/');
    const homeTitles = await page.locator('.home-insights .insight h3').allInnerTexts();
    assert.equal(homeTitles.length, 3);
    assert.equal(homeTitles[0], TITLE);
    console.log('PASS: home page shows the newest three');

    // sitemap, and the originals still intact
    const sitemap = fs.readFileSync(path.join(copy, 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.includes(`<loc>https://drkervis.com/insights/${slug}/</loc><lastmod>${today}</lastmod>`));
    assert.ok(!sitemap.includes('/admin'), 'the admin page is not in the sitemap');
    for (const original of ['ai-in-the-workflow', 'building-a-creator-ecosystem', 'business-with-social-purpose']) {
      assert.equal((await page.goto(`/insights/${original}/`)).status(), 200);
      assert.equal(await page.locator('.article-art figcaption').count(), 1, `${original} keeps its caption`);
    }
    console.log('PASS: sitemap lists the new page; the three original articles are untouched');

    // deleting it in /admin and rebuilding returns the site to how it was
    await page.goto('/admin/');
    await page.locator('.delete-button').click();
    await page.locator('#delete-confirm').click();
    await page.locator('#empty-state').waitFor();
    execFileSync('python', ['scripts/build_site.py'], { cwd: copy, encoding: 'utf8' });
    assert.equal((await page.goto(`/insights/${slug}/`)).status(), 404);
    assert.ok(!fs.existsSync(path.join(copy, 'images', 'insights', `${slug}.webp`)) && !fs.existsSync(path.join(copy, 'images', 'insights', `${slug}.jpg`)));
    await page.goto('/insights/');
    assert.equal(await page.locator('.insight').count(), 3);
    console.log('PASS: after deleting in /admin the page and its photos are gone');

    assert.deepEqual(problems, []);
    console.log('Publish-to-site chain verified.');
  } finally {
    await browser.close();
    await site.close();
    fs.rmSync(copy, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
