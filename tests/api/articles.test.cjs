// node --test "tests/api/*.test.cjs"
const test = require('node:test');
const assert = require('node:assert/strict');
const articles = require('../../api/_lib/articles.js');

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(16)]);
const NOW = new Date(Date.UTC(2026, 9, 21, 20, 30, 0)); // 22 Oct 04:30 in Kuala Lumpur

const photo = (overrides = {}) => ({ full: WEBP.toString('base64'), small: WEBP.toString('base64'), width: 1600, height: 1067, ...overrides });
const body = (overrides = {}) => ({ title: '一篇新的观点文章', content: '## 第一部分\n\n第一段内容。\n\n第二段内容。', photo: photo(), ...overrides });

test('sniffImage recognises webp and jpeg only', () => {
  assert.equal(articles.sniffImage(WEBP), 'webp');
  assert.equal(articles.sniffImage(JPEG), 'jpg');
  assert.equal(articles.sniffImage(PNG), null);
  assert.equal(articles.sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(articles.sniffImage(Buffer.alloc(0)), null);
});

test('slugify keeps lowercase words and hyphens', () => {
  assert.equal(articles.slugify('AI in the Workflow!'), 'ai-in-the-workflow');
  assert.equal(articles.slugify('  --Hello___World--  '), 'hello-world');
  assert.equal(articles.slugify('人工智能'), '');
  assert.equal(articles.slugify('x'.repeat(200)).length <= 60, true);
});

test('todayInKualaLumpur uses the local calendar day', () => {
  assert.equal(articles.todayInKualaLumpur(NOW), '2026-10-22');
});

test('fallbackSlug is valid and dated', () => {
  const slug = articles.fallbackSlug(NOW, () => 'ab12');
  assert.equal(slug, 'insight-20261022-ab12');
  assert.equal(articles.isValidSlug(slug), true);
});

test('isValidSlug mirrors the build rules', () => {
  for (const good of ['a', 'my-first-insight', 'a1-b2']) assert.equal(articles.isValidSlug(good), true, good);
  for (const bad of ['', 'Has-Capitals', '../x', 'a/b', '-a', 'a-', 'a--b', 'x'.repeat(81), '中文', 42, null]) {
    assert.equal(articles.isValidSlug(bad), false, String(bad));
  }
});

test('deriveSummary uses the first real paragraph and trims long ones', () => {
  assert.equal(articles.deriveSummary('## 标题\n- 要点\n第一段。\n第二段。'), '第一段。');
  const long = articles.deriveSummary('字'.repeat(300));
  assert.equal(long.length, 81);
  assert.ok(long.endsWith('…'));
  assert.equal(articles.deriveSummary('## 只有标题'), '');
});

test('uniqueSlug adds a number only when the address is taken or built in', () => {
  assert.equal(articles.uniqueSlug('fresh-idea', new Set(['other'])), 'fresh-idea');
  assert.equal(articles.uniqueSlug('taken', new Set(['taken'])), 'taken-2');
  assert.equal(articles.uniqueSlug('taken', new Set(['taken', 'taken-2'])), 'taken-3');
  assert.equal(articles.uniqueSlug('ai-in-the-workflow', new Set()), 'ai-in-the-workflow-2');
  assert.equal(articles.uniqueSlug('', new Set(['x'])), '');
});

test('a complete request is accepted', () => {
  const result = articles.validateInput(body(), { requirePhoto: true });
  assert.equal(result.ok, true);
  assert.equal(result.value.photo.ext, 'webp');
  assert.equal(result.value.photo.width, 1600);
  assert.ok(Buffer.isBuffer(result.value.photo.full));
});

test('title, content and photo are required when creating', () => {
  assert.equal(articles.validateInput(body({ title: ' ' }), { requirePhoto: true }).ok, false);
  assert.equal(articles.validateInput(body({ content: '' }), { requirePhoto: true }).ok, false);
  assert.equal(articles.validateInput(body({ content: '## 只有标题' }), { requirePhoto: true }).ok, false);
  const missing = articles.validateInput(body({ photo: undefined }), { requirePhoto: true });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /图片/);
  assert.equal(articles.validateInput(body({ photo: undefined }), { requirePhoto: false }).ok, true);
});

test('over-long or multi-line fields are rejected with a plain message', () => {
  for (const [field, value] of [['title', '字'.repeat(121)], ['title', '两\n行'], ['summary', '字'.repeat(201)], ['metaTitle', '字'.repeat(81)], ['metaDescription', '字'.repeat(201)], ['content', '字'.repeat(60001)]]) {
    const result = articles.validateInput(body({ [field]: value }), { requirePhoto: true });
    assert.equal(result.ok, false, field);
    assert.equal(typeof result.error, 'string');
  }
});

test('non-string fields are rejected', () => {
  for (const value of [42, {}, [], true]) {
    assert.equal(articles.validateInput(body({ title: value }), { requirePhoto: true }).ok, false);
  }
  assert.equal(articles.validateInput(null, { requirePhoto: true }).ok, false);
  assert.equal(articles.validateInput('text', { requirePhoto: true }).ok, false);
});

test('photos must be real webp or jpeg of the same type and a sensible size', () => {
  const check = (p) => articles.validateInput(body({ photo: p }), { requirePhoto: true });
  assert.equal(check(photo({ full: PNG.toString('base64') })).ok, false);
  assert.equal(check(photo({ small: JPEG.toString('base64') })).ok, false, 'mixed types');
  assert.equal(check(photo({ full: JPEG.toString('base64'), small: JPEG.toString('base64') })).value.photo.ext, 'jpg');
  assert.equal(check(photo({ full: 'not base64 !!' })).ok, false);
  assert.equal(check(photo({ full: Buffer.concat([WEBP, Buffer.alloc(2 * 1024 * 1024)]).toString('base64') })).ok, false, 'too big');
  assert.equal(check(photo({ small: Buffer.concat([WEBP, Buffer.alloc(401 * 1024)]).toString('base64') })).ok, false, 'small too big');
  for (const width of [0, -1, 1.5, '10', 10001]) assert.equal(check(photo({ width })).ok, false, String(width));
});

test('planCreate writes the record and both photos under the article slug', () => {
  const input = articles.validateInput(body({ slug: 'my-first-insight', summary: '一句话摘要', metaTitle: 'T', metaDescription: 'D' }), { requirePhoto: true }).value;
  const plan = articles.planCreate({ input, existingSlugs: new Set(), now: NOW });
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.upserts.map((file) => file.path), [
    'content/insights/my-first-insight.json', 'images/insights/my-first-insight.webp', 'images/insights/my-first-insight-640.webp',
  ]);
  const record = JSON.parse(plan.upserts[0].content);
  assert.deepEqual(record, {
    slug: 'my-first-insight', title: '一篇新的观点文章', summary: '一句话摘要', metaTitle: 'T', metaDescription: 'D',
    body: '## 第一部分\n\n第一段内容。\n\n第二段内容。',
    image: { src: '/images/insights/my-first-insight.webp', small: '/images/insights/my-first-insight-640.webp', width: 1600, height: 1067, alt: '一篇新的观点文章' },
    published: '2026-10-22', modified: '2026-10-22',
  });
  assert.deepEqual(plan.deletes, []);
});

test('planCreate fills a missing slug, summary and meta text', () => {
  const input = articles.validateInput(body(), { requirePhoto: true }).value;
  const plan = articles.planCreate({ input, existingSlugs: new Set(), now: NOW, random: () => 'zz99' });
  const record = JSON.parse(plan.upserts[0].content);
  assert.equal(record.slug, 'insight-20261022-zz99');
  assert.equal(record.summary, '第一段内容。');
  assert.equal(record.metaTitle, '一篇新的观点文章');
  assert.equal(record.metaDescription, '第一段内容。');
});

test('planCreate refuses a slug that is taken or built in', () => {
  const input = articles.validateInput(body({ slug: 'taken-one' }), { requirePhoto: true }).value;
  assert.match(articles.planCreate({ input, existingSlugs: new Set(['taken-one']), now: NOW }).error, /网址/);
  const builtIn = articles.validateInput(body({ slug: 'ai-in-the-workflow' }), { requirePhoto: true }).value;
  assert.match(articles.planCreate({ input: builtIn, existingSlugs: new Set(), now: NOW }).error, /网址/);
  const invalid = articles.validateInput(body({ slug: 'Bad Slug!' }), { requirePhoto: true }).value;
  assert.match(articles.planCreate({ input: invalid, existingSlugs: new Set(), now: NOW }).error, /网址/);
});

test('planUpdate keeps slug and publish date, and only touches photos when a new one is sent', () => {
  const created = articles.planCreate({
    input: articles.validateInput(body({ slug: 'keep-me', summary: 'S' }), { requirePhoto: true }).value, existingSlugs: new Set(), now: new Date(Date.UTC(2026, 9, 1)),
  });
  const existing = JSON.parse(created.upserts[0].content);
  const input = articles.validateInput(body({ title: '新标题', slug: 'ignored-slug', photo: undefined }), { requirePhoto: false }).value;
  const plan = articles.planUpdate({ input, existing, now: NOW });
  assert.deepEqual(plan.upserts.map((file) => file.path), ['content/insights/keep-me.json']);
  const record = JSON.parse(plan.upserts[0].content);
  assert.equal(record.slug, 'keep-me');
  assert.equal(record.title, '新标题');
  assert.equal(record.published, '2026-10-01');
  assert.equal(record.modified, '2026-10-22');
  assert.deepEqual(record.image, { ...existing.image, alt: '新标题' });
  assert.deepEqual(plan.deletes, []);
});

test('planUpdate with a new photo of another type removes the old files', () => {
  const existing = JSON.parse(articles.planCreate({ input: articles.validateInput(body({ slug: 'swap' }), { requirePhoto: true }).value, existingSlugs: new Set(), now: NOW }).upserts[0].content);
  const jpegPhoto = photo({ full: JPEG.toString('base64'), small: JPEG.toString('base64') });
  const input = articles.validateInput(body({ photo: jpegPhoto }), { requirePhoto: true }).value;
  const plan = articles.planUpdate({ input, existing, now: NOW });
  assert.deepEqual(plan.upserts.map((file) => file.path), ['content/insights/swap.json', 'images/insights/swap.jpg', 'images/insights/swap-640.jpg']);
  assert.deepEqual(plan.deletes, ['images/insights/swap.webp', 'images/insights/swap-640.webp']);
});

test('planDelete removes the record and its photos', () => {
  const record = { slug: 'gone', image: { src: '/images/insights/gone.webp', small: '/images/insights/gone-640.webp' } };
  assert.deepEqual(articles.planDelete(record), {
    upserts: [], deletes: ['content/insights/gone.json', 'images/insights/gone.webp', 'images/insights/gone-640.webp'],
  });
});

test('planDelete refuses records whose paths are not under the insights folders', () => {
  assert.throws(() => articles.planDelete({ slug: 'x', image: { src: '/images/hero.jpg', small: '/images/hero.jpg' } }));
  assert.throws(() => articles.planDelete({ slug: '../x', image: { src: '/images/insights/a.webp', small: '/images/insights/a-640.webp' } }));
});

test('summarise returns only what the list needs', () => {
  const record = { slug: 's', title: 'T', summary: 'S', body: 'long', published: '2026-10-01', modified: '2026-10-02', image: { small: '/images/insights/s-640.webp' } };
  assert.deepEqual(articles.summarise(record), { slug: 's', title: 'T', summary: 'S', published: '2026-10-01', modified: '2026-10-02', thumbnail: '/images/insights/s-640.webp' });
});
