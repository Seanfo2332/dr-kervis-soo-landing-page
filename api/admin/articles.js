'use strict';
// GET    /api/admin/articles            -> the list (newest first)
// GET    /api/admin/articles?slug=x     -> one article in full, for editing
// POST   /api/admin/articles            -> publish a new article (a photo is required)
// PUT    /api/admin/articles            -> change an article (the address and date stay)
// DELETE /api/admin/articles?slug=x     -> remove an article and its photos
// Every change is one commit to GitHub, which makes Vercel rebuild the site.
const { isAuthenticated, isSameOrigin } = require('../_lib/session.js');
const { SESSION_EXPIRED, NOT_SET_UP, WRONG_ORIGIN, GENERIC_ERROR, sendJson, logFailure } = require('../_lib/http.js');
const { validateInput, planCreate, planUpdate, planDelete, summarise, uniqueSlug, isValidSlug } = require('../_lib/articles.js');
const { suggestFields } = require('../_lib/suggest.js');
const { githubFromEnv } = require('../_lib/config.js');

const newestFirst = (a, b) => b.published.localeCompare(a.published) || a.slug.localeCompare(b.slug);

function createHandler({ env = process.env, now = () => new Date(), makeGithub = githubFromEnv, suggest = suggestFields } = {}) {
  async function fillMissingFields(input, takenSlugs) {
    if (input.summary && input.metaTitle && input.metaDescription && input.slug) return input;
    const result = await suggest({ title: input.title, content: input.content }, { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
    if (result.reason) console.error(`[admin] suggestions fell back: ${result.reason}`);
    const fields = result.fields;
    return {
      ...input,
      summary: input.summary || fields.summary,
      metaTitle: input.metaTitle || fields.metaTitle,
      metaDescription: input.metaDescription || fields.metaDescription,
      slug: input.slug || uniqueSlug(fields.slug, takenSlugs),
    };
  }

  async function list(req, res, github) {
    const records = await github.listRecords();
    if (!req.query.slug) return sendJson(res, 200, { articles: records.map(summarise).sort(newestFirst) });
    const article = records.find((record) => record.slug === req.query.slug);
    return article ? sendJson(res, 200, { article }) : sendJson(res, 404, { error: '找不到这篇文章。' });
  }

  async function create(req, res, github) {
    const checked = validateInput(req.body, { requirePhoto: true });
    if (!checked.ok) return sendJson(res, 400, { error: checked.error });
    const takenSlugs = new Set((await github.listRecords()).map((record) => record.slug));
    const input = await fillMissingFields(checked.value, takenSlugs);
    const plan = planCreate({ input, existingSlugs: takenSlugs, now: now() });
    if (plan.error) return sendJson(res, plan.conflict ? 409 : 400, { error: plan.error });
    await github.commit({ message: `chore: publish insight ${plan.record.slug}`, upserts: plan.upserts, deletes: plan.deletes });
    return sendJson(res, 201, { ok: true, slug: plan.record.slug, url: `/insights/${plan.record.slug}/` });
  }

  async function update(req, res, github) {
    const checked = validateInput(req.body, { requirePhoto: false });
    if (!checked.ok) return sendJson(res, 400, { error: checked.error });
    const existing = (await github.listRecords()).find((record) => record.slug === checked.value.slug);
    if (!existing) return sendJson(res, 404, { error: '找不到这篇文章。' });
    const plan = planUpdate({ input: checked.value, existing, now: now() });
    await github.commit({ message: `chore: update insight ${existing.slug}`, upserts: plan.upserts, deletes: plan.deletes });
    return sendJson(res, 200, { ok: true, slug: existing.slug, url: `/insights/${existing.slug}/` });
  }

  async function remove(req, res, github) {
    const { slug } = req.query;
    if (!isValidSlug(slug)) return sendJson(res, 400, { error: '缺少要删除的文章。' });
    const existing = (await github.listRecords()).find((record) => record.slug === slug);
    if (!existing) return sendJson(res, 404, { error: '找不到这篇文章。' });
    const plan = planDelete(existing);
    await github.commit({ message: `chore: remove insight ${slug}`, upserts: plan.upserts, deletes: plan.deletes });
    return sendJson(res, 200, { ok: true });
  }

  const actions = { GET: list, POST: create, PUT: update, DELETE: remove };

  return async function handler(req, res) {
    if (!isAuthenticated(req, env, now().getTime())) return sendJson(res, 401, { error: SESSION_EXPIRED });
    const action = actions[req.method];
    if (!action) {
      res.setHeader('Allow', Object.keys(actions).join(', '));
      return sendJson(res, 405, { error: '不支持这种请求。' });
    }
    if (req.method !== 'GET' && !isSameOrigin(req)) return sendJson(res, 403, { error: WRONG_ORIGIN });
    const github = makeGithub(env);
    if (!github) return sendJson(res, 503, { error: NOT_SET_UP });
    try {
      return await action(req, res, github);
    } catch (error) {
      logFailure(`${req.method} articles`, error, env);
      return sendJson(res, 502, { error: GENERIC_ERROR });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
