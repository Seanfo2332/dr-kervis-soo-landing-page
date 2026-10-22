'use strict';
// POST /api/admin/suggest { title, content } -> { fields: { summary, metaTitle, metaDescription, slug }, notice? }
// Fills in the optional fields of the article form. It never changes anything on the site.
const { isAuthenticated, isSameOrigin } = require('../_lib/session.js');
const { SESSION_EXPIRED, WRONG_ORIGIN, sendJson, logFailure } = require('../_lib/http.js');
const { suggestFields } = require('../_lib/suggest.js');
const { uniqueSlug } = require('../_lib/articles.js');
const { githubFromEnv } = require('../_lib/config.js');

const FALLBACK_NOTICE = '智能建议暂时不可用，已用文章开头的文字作为摘要，你可以自己修改。';
const isText = (value) => typeof value === 'string' && value.trim() !== '';

function createHandler({ env = process.env, now = () => new Date(), makeGithub = githubFromEnv, suggest = suggestFields } = {}) {
  // A web address that is already taken is only a nuisance, so a failed lookup must not stop the suggestions.
  async function takenSlugs() {
    const github = makeGithub(env);
    if (!github) return new Set();
    try {
      return new Set((await github.listRecords()).map((record) => record.slug));
    } catch (error) {
      logFailure('suggest slug lookup', error, env);
      return new Set();
    }
  }

  return async function handler(req, res) {
    if (!isAuthenticated(req, env, now().getTime())) return sendJson(res, 401, { error: SESSION_EXPIRED });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: '不支持这种请求。' });
    }
    if (!isSameOrigin(req)) return sendJson(res, 403, { error: WRONG_ORIGIN });
    const { title, content } = req.body || {};
    if (!isText(title) || !isText(content)) return sendJson(res, 400, { error: '请先填写文章标题和内容。' });

    const result = await suggest({ title: title.trim(), content }, { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
    if (result.reason) console.error(`[admin] suggestions fell back: ${result.reason}`);
    const fields = { ...result.fields, slug: uniqueSlug(result.fields.slug, await takenSlugs()) };
    return sendJson(res, 200, result.source === 'ai' ? { fields } : { fields, notice: FALLBACK_NOTICE });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
