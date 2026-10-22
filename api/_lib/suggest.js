'use strict';
// Suggests the one-line summary, the Google title and description, and a web address for a pasted article.
// It must never block publishing: any failure (no key, network, odd reply) falls back to plain text taken from the article.
const { deriveSummary, slugify } = require('./articles.js');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5';
const REQUEST_TIMEOUT_MS = 25000;
const MAX_PROMPT_CHARACTERS = 6000;
const MAX_REPLY_TOKENS = 700;
const MIN_SLUG_LENGTH = 3;
const LIMITS = { summary: 100, metaTitle: 60, metaDescription: 160 };

const SYSTEM_PROMPT = [
  '你是中文个人官方网站的编辑助手。根据给定的文章，只使用文章里已经有的信息，写出下面四项：',
  'summary：一句话摘要，不超过 50 个字。',
  'metaTitle：搜索结果里显示的标题，不超过 30 个字。',
  'metaDescription：搜索结果里显示的描述，不超过 90 个字。',
  'slug：用 3 到 6 个英文单词概括主题，全部小写，用连字符连接。',
  '不要添加文章里没有的事实、数字、头衔、奖项或评价，不要夸大，不要使用营销口号。',
  '只输出一个 JSON 对象，键名必须是 summary、metaTitle、metaDescription、slug，不要输出其他文字。',
].join('\n');

const tidy = (value, limit) => (typeof value === 'string' ? Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, limit).join('') : '');

// With no AI to translate the title, the web address uses the English words and numbers already in it
// ("Dr Kervis苏才育启动VYBE AI" -> "dr-kervis-vybe-ai"). A Chinese-only title gets none, and the server
// then falls back to a dated number.
function addressFromTitle(title) {
  const address = slugify((title.match(/[A-Za-z0-9]+/g) || []).join('-'));
  return address.length >= MIN_SLUG_LENGTH ? address : '';
}

function fallbackFields({ title, content }) {
  const summary = tidy(deriveSummary(content), LIMITS.summary);
  return { summary, metaTitle: tidy(title, LIMITS.metaTitle), metaDescription: tidy(summary, LIMITS.metaDescription), slug: addressFromTitle(title) };
}

function readReplyObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
}

function mergeWithFallback(reply, fallback) {
  const slug = typeof reply.slug === 'string' ? slugify(reply.slug) : '';
  return {
    summary: tidy(reply.summary, LIMITS.summary) || fallback.summary,
    metaTitle: tidy(reply.metaTitle, LIMITS.metaTitle) || fallback.metaTitle,
    metaDescription: tidy(reply.metaDescription, LIMITS.metaDescription) || fallback.metaDescription,
    slug: slug.length >= MIN_SLUG_LENGTH ? slug : fallback.slug,
  };
}

async function suggestFields({ title, content }, { apiKey, model = DEFAULT_MODEL, fetchImpl = fetch }) {
  const fallback = fallbackFields({ title, content });
  if (!apiKey) return { source: 'fallback', reason: 'no-api-key', fields: fallback };
  try {
    const response = await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: MAX_REPLY_TOKENS, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `标题：${title}\n\n正文：\n${content.slice(0, MAX_PROMPT_CHARACTERS)}` }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { source: 'fallback', reason: `http-${response.status}`, fields: fallback };
    const data = await response.json();
    const text = data && Array.isArray(data.content) && data.content[0] ? data.content[0].text : '';
    const reply = typeof text === 'string' ? readReplyObject(text) : null;
    return reply ? { source: 'ai', fields: mergeWithFallback(reply, fallback) } : { source: 'fallback', reason: 'unreadable-reply', fields: fallback };
  } catch (error) {
    return { source: 'fallback', reason: `error: ${error.name}`, fields: fallback };
  }
}

module.exports = { suggestFields, MAX_PROMPT_CHARACTERS };
