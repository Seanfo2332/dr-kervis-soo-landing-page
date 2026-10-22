// node --test "tests/api/*.test.cjs"
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestFields, MAX_PROMPT_CHARACTERS } = require('../../api/_lib/suggest.js');

const ARTICLE = { title: '人工智能的价值，始于真实的工作场景', content: '## 先找到问题\n\n企业面对新工具时，要先弄清楚问题。\n\n再选择工具。' };
const reply = (text, status = 200) => ({ ok: status === 200, status, json: async () => ({ content: [{ type: 'text', text }] }) });
const fetchReturning = (response) => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return response; };
  return { fetchImpl, calls };
};
const AI_JSON = JSON.stringify({ summary: '先找问题，再选工具。', metaTitle: '人工智能始于真实场景', metaDescription: '企业应先弄清楚问题，再选择合适的人工智能工具。', slug: 'AI Starts With Real Work!' });

test('without an API key it falls back and never calls the network', async () => {
  const { fetchImpl, calls } = fetchReturning(reply(AI_JSON));
  const result = await suggestFields(ARTICLE, { apiKey: '', fetchImpl });
  assert.equal(result.source, 'fallback');
  assert.equal(calls.length, 0);
  assert.equal(result.fields.summary, '企业面对新工具时，要先弄清楚问题。');
  assert.equal(result.fields.metaTitle, ARTICLE.title);
  assert.equal(result.fields.metaDescription, result.fields.summary);
  assert.equal(result.fields.slug, '');
});

test('without an API key the address is made from the English words already in the title', async () => {
  const noKey = (title) => suggestFields({ title, content: '正文。' }, { apiKey: '', fetchImpl: async () => { throw new Error('no network'); } });
  assert.equal((await noKey('星域集团 Dr Kervis苏才育启动VYBE AI娱乐生态')).fields.slug, 'dr-kervis-vybe-ai');
  assert.equal((await noKey('2026年Hari Raya特辑')).fields.slug, '2026-hari-raya');
  assert.equal((await noKey('全是中文的标题')).fields.slug, '');
  assert.equal((await noKey('只有AI')).fields.slug, '', 'too short to be a useful address');
});

test('when the AI gives no usable address, the English words in the title are used', async () => {
  const unusable = JSON.stringify({ summary: 's', metaTitle: 't', metaDescription: 'd', slug: '!!' });
  const result = await suggestFields({ title: 'VYBE Malaysia 启动', content: '正文。' }, { apiKey: 'k', fetchImpl: fetchReturning(reply(unusable)).fetchImpl });
  assert.equal(result.fields.slug, 'vybe-malaysia');
});

test('a good reply is used, with the slug cleaned up', async () => {
  const { fetchImpl, calls } = fetchReturning(reply(`好的：\n\`\`\`json\n${AI_JSON}\n\`\`\``));
  const result = await suggestFields(ARTICLE, { apiKey: 'sk-test', fetchImpl });
  assert.equal(result.source, 'ai');
  assert.deepEqual(result.fields, {
    summary: '先找问题，再选工具。', metaTitle: '人工智能始于真实场景',
    metaDescription: '企业应先弄清楚问题，再选择合适的人工智能工具。', slug: 'ai-starts-with-real-work',
  });
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].options.headers['x-api-key'], 'sk-test');
  assert.equal(calls[0].options.headers['anthropic-version'], '2023-06-01');
  assert.ok(!calls[0].url.includes('sk-test'));
});

test('the prompt carries the article and forbids invented facts', async () => {
  const { fetchImpl, calls } = fetchReturning(reply(AI_JSON));
  await suggestFields(ARTICLE, { apiKey: 'k', fetchImpl, model: 'test-model' });
  assert.equal(calls[0].body.model, 'test-model');
  assert.match(calls[0].body.system, /不要添加/);
  assert.ok(calls[0].body.messages[0].content.includes(ARTICLE.title));
  assert.ok(calls[0].body.messages[0].content.includes('再选择工具'));
});

test('very long articles are cut before they are sent', async () => {
  const { fetchImpl, calls } = fetchReturning(reply(AI_JSON));
  await suggestFields({ title: '长', content: '字'.repeat(MAX_PROMPT_CHARACTERS * 3) }, { apiKey: 'k', fetchImpl });
  assert.ok(calls[0].body.messages[0].content.length < MAX_PROMPT_CHARACTERS + 200);
});

test('failures fall back instead of throwing', async () => {
  const cases = [
    reply('', 500),
    reply('这不是 JSON'),
    reply('{"summary": 12, "metaTitle": null}'),
    { ok: true, status: 200, json: async () => ({ content: [] }) },
    { ok: true, status: 200, json: async () => { throw new Error('bad body'); } },
  ];
  for (const response of cases) {
    const result = await suggestFields(ARTICLE, { apiKey: 'k', fetchImpl: async () => response });
    assert.equal(result.fields.summary, '企业面对新工具时，要先弄清楚问题。');
    assert.equal(result.fields.slug, '');
  }
  const thrown = await suggestFields(ARTICLE, { apiKey: 'k', fetchImpl: async () => { throw new Error('network down'); } });
  assert.equal(thrown.source, 'fallback');
});

test('missing or unusable fields are filled one by one', async () => {
  const partial = JSON.stringify({ summary: '只有摘要。', slug: 'x' });
  const result = await suggestFields(ARTICLE, { apiKey: 'k', fetchImpl: fetchReturning(reply(partial)).fetchImpl });
  assert.equal(result.fields.summary, '只有摘要。');
  assert.equal(result.fields.metaTitle, ARTICLE.title);
  assert.equal(result.fields.slug, '', 'a one-letter slug is not useful');
});

test('over-long values are shortened and line breaks removed', async () => {
  const long = JSON.stringify({ summary: `${'字'.repeat(150)}\n第二行`, metaTitle: '标'.repeat(200), metaDescription: '描'.repeat(500), slug: 'a-'.repeat(100) });
  const { fields } = await suggestFields(ARTICLE, { apiKey: 'k', fetchImpl: fetchReturning(reply(long)).fetchImpl });
  assert.ok(Array.from(fields.summary).length <= 100);
  assert.ok(!fields.summary.includes('\n'));
  assert.ok(Array.from(fields.metaTitle).length <= 60);
  assert.ok(Array.from(fields.metaDescription).length <= 160);
  assert.ok(fields.slug.length <= 60);
  assert.match(fields.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});
