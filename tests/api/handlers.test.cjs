// node --test "tests/api/*.test.cjs"
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionToken, createRateLimiter } = require('../../api/_lib/session.js');
const sessionApi = require('../../api/admin/session.js');
const articlesApi = require('../../api/admin/articles.js');
const suggestApi = require('../../api/admin/suggest.js');

const SECRET = 'a-long-random-test-secret-0123456789';
const PASSWORD = 'correct horse battery staple';
const NOW = new Date(Date.UTC(2026, 9, 21, 20, 30, 0));
const ENV = { ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, GITHUB_TOKEN: 'ghp_secret_token_value', ANTHROPIC_API_KEY: 'sk-ant-secret' };
const COOKIE = `admin_session=${createSessionToken(SECRET, NOW.getTime())}`;
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]).toString('base64');

function fakeRes() {
  return {
    headers: {}, statusCode: undefined, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}
const request = (method, { body, query = {}, cookie = COOKIE, origin = 'https://drkervis.com', host = 'drkervis.com' } = {}) => ({
  method, body, query, headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), host, 'x-forwarded-for': '9.9.9.9' },
});
const run = async (handler, req) => { const res = fakeRes(); await handler(req, res); return res; };

// ---------- login ----------
const sessionHandler = (extra = {}) => sessionApi.createHandler({ env: ENV, now: () => NOW.getTime(), sleep: async () => {}, ...extra });

test('login: the page can ask whether it is signed in', async () => {
  assert.deepEqual((await run(sessionHandler(), request('GET', { cookie: '' }))).body, { authenticated: false });
  assert.deepEqual((await run(sessionHandler(), request('GET'))).body, { authenticated: true });
});

test('login: the right password signs in with a locked-down cookie', async () => {
  const res = await run(sessionHandler(), request('POST', { body: { password: PASSWORD }, cookie: '' }));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /admin_session=.+; HttpOnly; Secure; SameSite=Strict; Path=\/api\/admin/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('login: a wrong password is refused, slowed down and gives no cookie', async () => {
  let waited = 0;
  const res = await run(sessionHandler({ sleep: async (ms) => { waited = ms; } }), request('POST', { body: { password: 'nope' }, cookie: '' }));
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
  assert.ok(waited > 0);
  assert.ok(!JSON.stringify(res.body).includes(PASSWORD));
});

test('login: too many wrong attempts lock the address out, even for the right password', async () => {
  const handler = sessionHandler({ limiter: createRateLimiter({ maxFailures: 2, windowMs: 60000 }) });
  await run(handler, request('POST', { body: { password: 'a' }, cookie: '' }));
  await run(handler, request('POST', { body: { password: 'b' }, cookie: '' }));
  assert.equal((await run(handler, request('POST', { body: { password: PASSWORD }, cookie: '' }))).statusCode, 429);
});

test('login: foreign sites cannot log in or out for a visitor', async () => {
  for (const method of ['POST', 'DELETE']) {
    const res = await run(sessionHandler(), request(method, { body: { password: PASSWORD }, origin: 'https://evil.example' }));
    assert.equal(res.statusCode, 403, method);
    assert.equal(res.headers['Set-Cookie'], undefined);
  }
  assert.equal((await run(sessionHandler(), request('POST', { body: { password: PASSWORD }, origin: '' }))).statusCode, 403);
});

test('login: an unconfigured site says so instead of letting anyone in', async () => {
  const res = await run(sessionHandler({ env: { SESSION_SECRET: SECRET } }), request('POST', { body: { password: '' }, cookie: '' }));
  assert.equal(res.statusCode, 503);
  assert.equal((await run(sessionHandler({ env: { ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'short' } }), request('POST', { body: { password: PASSWORD } }))).statusCode, 503);
});

test('login: logging out clears the cookie; other methods are refused', async () => {
  assert.match((await run(sessionHandler(), request('DELETE'))).headers['Set-Cookie'], /Max-Age=0/);
  assert.equal((await run(sessionHandler(), request('PUT'))).statusCode, 405);
});

// ---------- articles ----------
function fakeGithub(records = []) {
  const commits = [];
  return { commits, listRecords: async () => records, commit: async (change) => { commits.push(change); return 'abc123'; } };
}
const storedRecord = (slug, published) => ({
  slug, title: `标题 ${slug}`, summary: '摘要', metaTitle: 'm', metaDescription: 'd', body: '## 一\n\n正文',
  image: { src: `/images/insights/${slug}.webp`, small: `/images/insights/${slug}-640.webp`, width: 100, height: 100, alt: 'a' }, published, modified: published,
});
const newArticle = (overrides = {}) => ({
  title: '新的观点文章', content: '## 第一部分\n\n第一段内容。', summary: '摘要', metaTitle: 'T', metaDescription: 'D', slug: 'my-new-insight',
  photo: { full: WEBP, small: WEBP, width: 1600, height: 1067 }, ...overrides,
});
const articlesHandler = ({ github = fakeGithub(), suggest = async () => ({ source: 'fallback', fields: {} }), env = ENV } = {}) =>
  articlesApi.createHandler({ env, now: () => NOW, makeGithub: () => github, suggest });

test('articles: every action needs a signed-in session', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const res = await run(articlesHandler(), request(method, { cookie: '', body: newArticle(), query: { slug: 'x' } }));
    assert.equal(res.statusCode, 401, method);
  }
});

test('articles: writes from another website are refused', async () => {
  const github = fakeGithub();
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = await run(articlesHandler({ github }), request(method, { origin: 'https://evil.example', body: newArticle(), query: { slug: 'x' } }));
    assert.equal(res.statusCode, 403, method);
  }
  assert.equal(github.commits.length, 0);
});

test('articles: a missing GitHub token is reported as not set up', async () => {
  const res = await run(articlesApi.createHandler({ env: { ...ENV, GITHUB_TOKEN: '' }, now: () => NOW }), request('GET'));
  assert.equal(res.statusCode, 503);
});

test('articles: the list is newest first and light', async () => {
  const github = fakeGithub([storedRecord('older', '2026-10-01'), storedRecord('newer', '2026-10-20')]);
  const res = await run(articlesHandler({ github }), request('GET'));
  assert.deepEqual(res.body.articles.map((a) => a.slug), ['newer', 'older']);
  assert.equal(res.body.articles[0].body, undefined);
});

test('articles: one article can be loaded in full for editing', async () => {
  const github = fakeGithub([storedRecord('here', '2026-10-01')]);
  assert.equal((await run(articlesHandler({ github }), request('GET', { query: { slug: 'here' } }))).body.article.body, '## 一\n\n正文');
  assert.equal((await run(articlesHandler({ github }), request('GET', { query: { slug: 'missing' } }))).statusCode, 404);
});

test('articles: publishing commits the record and both photos', async () => {
  const github = fakeGithub();
  const res = await run(articlesHandler({ github }), request('POST', { body: newArticle() }));
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { ok: true, slug: 'my-new-insight', url: '/insights/my-new-insight/' });
  assert.equal(github.commits.length, 1);
  assert.equal(github.commits[0].message, 'chore: publish insight my-new-insight');
  assert.deepEqual(github.commits[0].upserts.map((f) => f.path), [
    'content/insights/my-new-insight.json', 'images/insights/my-new-insight.webp', 'images/insights/my-new-insight-640.webp',
  ]);
});

test('articles: blank summary, search text and address are suggested; filled ones are kept', async () => {
  const github = fakeGithub();
  const asked = [];
  const suggest = async (article) => { asked.push(article); return { source: 'ai', fields: { summary: '建议摘要', metaTitle: '建议标题', metaDescription: '建议描述', slug: 'suggested-address' } }; };
  const res = await run(articlesHandler({ github, suggest }), request('POST', { body: newArticle({ summary: '', metaTitle: '我写的标题', metaDescription: '', slug: '' }) }));
  assert.equal(res.statusCode, 201);
  const record = JSON.parse(github.commits[0].upserts[0].content);
  assert.deepEqual([record.slug, record.summary, record.metaTitle, record.metaDescription], ['suggested-address', '建议摘要', '我写的标题', '建议描述']);
  assert.equal(asked.length, 1);
  await run(articlesHandler({ github, suggest }), request('POST', { body: newArticle({ slug: 'another-one' }) }));
  assert.equal(asked.length, 1, 'nothing missing, so no suggestion call');
});

test('articles: a suggested address that is already used gets a number', async () => {
  const github = fakeGithub([storedRecord('suggested-address', '2026-10-01')]);
  const suggest = async () => ({ source: 'ai', fields: { summary: 's', metaTitle: 't', metaDescription: 'd', slug: 'suggested-address' } });
  const res = await run(articlesHandler({ github, suggest }), request('POST', { body: newArticle({ slug: '' }) }));
  assert.equal(res.body.slug, 'suggested-address-2');
});

test('articles: bad input is explained in plain Chinese and nothing is committed', async () => {
  const github = fakeGithub();
  const res = await run(articlesHandler({ github }), request('POST', { body: newArticle({ title: '' }) }));
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /标题/);
  assert.equal((await run(articlesHandler({ github }), request('POST', { body: newArticle({ photo: undefined }) }))).statusCode, 400);
  assert.equal(github.commits.length, 0);
});

test('articles: a web address already in use is a conflict', async () => {
  const github = fakeGithub([storedRecord('my-new-insight', '2026-10-01')]);
  const res = await run(articlesHandler({ github }), request('POST', { body: newArticle() }));
  assert.equal(res.statusCode, 409);
  assert.equal(github.commits.length, 0);
});

test('articles: a GitHub failure gives a generic message and never leaks secrets', async () => {
  const github = { listRecords: async () => [], commit: async () => { throw new Error(`boom ${ENV.GITHUB_TOKEN}`); } };
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const res = await run(articlesHandler({ github }), request('POST', { body: newArticle() }));
    assert.equal(res.statusCode, 502);
    assert.ok(!JSON.stringify(res.body).includes(ENV.GITHUB_TOKEN));
    assert.ok(logged.length > 0, 'the failure is logged for the site owner');
    assert.ok(!logged.join(' ').includes(ENV.GITHUB_TOKEN), 'logs never contain the token');
  } finally {
    console.error = original;
  }
});

test('articles: editing keeps the address and date, and needs no new photo', async () => {
  const github = fakeGithub([storedRecord('here', '2026-10-01')]);
  const res = await run(articlesHandler({ github }), request('PUT', { body: newArticle({ slug: 'here', title: '改过的标题', photo: undefined }) }));
  assert.equal(res.statusCode, 200);
  const record = JSON.parse(github.commits[0].upserts[0].content);
  assert.deepEqual([record.slug, record.title, record.published, record.modified], ['here', '改过的标题', '2026-10-01', '2026-10-22']);
  assert.equal(github.commits[0].message, 'chore: update insight here');
  assert.equal((await run(articlesHandler({ github }), request('PUT', { body: newArticle({ slug: 'missing' }) }))).statusCode, 404);
});

test('articles: deleting removes the record and its photos', async () => {
  const github = fakeGithub([storedRecord('gone', '2026-10-01')]);
  const res = await run(articlesHandler({ github }), request('DELETE', { query: { slug: 'gone' } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(github.commits[0].deletes, ['content/insights/gone.json', 'images/insights/gone.webp', 'images/insights/gone-640.webp']);
  assert.equal(github.commits[0].message, 'chore: remove insight gone');
  assert.equal((await run(articlesHandler({ github }), request('DELETE', { query: { slug: 'missing' } }))).statusCode, 404);
  assert.equal((await run(articlesHandler({ github }), request('DELETE', { query: {} }))).statusCode, 400);
});

// ---------- suggestions ----------
const suggestHandler = ({ suggest, github = fakeGithub() } = {}) => suggestApi.createHandler({ env: ENV, now: () => NOW, makeGithub: () => github, suggest });

test('suggest: needs a session and a title and text', async () => {
  const ok = async () => ({ source: 'ai', fields: { summary: 's', metaTitle: 't', metaDescription: 'd', slug: 'x-y-z' } });
  assert.equal((await run(suggestHandler({ suggest: ok }), request('POST', { cookie: '', body: { title: 't', content: 'c' } }))).statusCode, 401);
  assert.equal((await run(suggestHandler({ suggest: ok }), request('POST', { origin: 'https://evil.example', body: { title: 't', content: 'c' } }))).statusCode, 403);
  assert.equal((await run(suggestHandler({ suggest: ok }), request('POST', { body: { title: '', content: 'c' } }))).statusCode, 400);
  assert.equal((await run(suggestHandler({ suggest: ok }), request('POST', { body: { title: 't', content: 5 } }))).statusCode, 400);
  assert.equal((await run(suggestHandler({ suggest: ok }), request('GET'))).statusCode, 405);
});

test('suggest: returns the fields with an unused address and says when the AI was not used', async () => {
  const github = fakeGithub([storedRecord('x-y-z', '2026-10-01')]);
  const ai = await run(suggestHandler({ github, suggest: async () => ({ source: 'ai', fields: { summary: 's', metaTitle: 't', metaDescription: 'd', slug: 'x-y-z' } }) }), request('POST', { body: { title: 't', content: 'c' } }));
  assert.equal(ai.body.fields.slug, 'x-y-z-2');
  assert.equal(ai.body.notice, undefined);
  const fallback = await run(suggestHandler({ suggest: async () => ({ source: 'fallback', reason: 'no-api-key', fields: { summary: 's', metaTitle: 't', metaDescription: 'd', slug: '' } }) }), request('POST', { body: { title: 't', content: 'c' } }));
  assert.match(fallback.body.notice, /智能建议/);
});
