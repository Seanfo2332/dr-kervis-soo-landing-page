'use strict';
// GET  /api/admin/session  -> { authenticated }
// POST /api/admin/session  { password } -> signs in (sets the session cookie)
// DELETE /api/admin/session -> signs out
const {
  SESSION_TTL_MS, isUsableSecret, createSessionToken, passwordMatches, buildCookie, clearCookie, isAuthenticated, isSameOrigin, createRateLimiter,
} = require('../_lib/session.js');
const { NOT_SET_UP, WRONG_ORIGIN, sendJson, clientAddress, wait } = require('../_lib/http.js');

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGIN_DELAY_MS = 800;

function createHandler({
  env = process.env, now = Date.now, sleep = wait,
  limiter = createRateLimiter({ maxFailures: MAX_FAILED_LOGINS, windowMs: LOCKOUT_WINDOW_MS }),
} = {}) {
  return async function handler(req, res) {
    if (req.method === 'GET') return sendJson(res, 200, { authenticated: isAuthenticated(req, env, now()) });
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return sendJson(res, 405, { error: '不支持这种请求。' });
    }
    if (!isSameOrigin(req)) return sendJson(res, 403, { error: WRONG_ORIGIN });
    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', clearCookie());
      return sendJson(res, 200, { ok: true });
    }
    if (!env.ADMIN_PASSWORD || !isUsableSecret(env.SESSION_SECRET)) return sendJson(res, 503, { error: NOT_SET_UP });

    const address = clientAddress(req);
    if (limiter.isBlocked(address, now())) return sendJson(res, 429, { error: '尝试次数太多，请 15 分钟后再试。' });
    if (!passwordMatches(req.body && req.body.password, env.ADMIN_PASSWORD)) {
      limiter.recordFailure(address, now());
      await sleep(FAILED_LOGIN_DELAY_MS);
      return sendJson(res, 401, { error: '密码不正确，请再试一次。' });
    }
    limiter.reset(address);
    res.setHeader('Set-Cookie', buildCookie(createSessionToken(env.SESSION_SECRET, now()), SESSION_TTL_MS / 1000));
    return sendJson(res, 200, { ok: true });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
