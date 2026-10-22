'use strict';
// Small helpers shared by the /api/admin functions.

const GENERIC_ERROR = '操作没有成功，请稍后再试。如果一直失败，请联系网站管理员。';
const SESSION_EXPIRED = '登录已过期，请重新登录。';
const NOT_SET_UP = '管理功能还没有设置完成，请联系网站管理员。';
const WRONG_ORIGIN = '请求来源不正确，请从网站的管理页面操作。';
const SECRET_NAMES = ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'ADMIN_PASSWORD', 'SESSION_SECRET'];

function sendJson(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function clientAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Server logs are for the site owner, but a secret must never end up in them, even inside an error message.
function redactSecrets(text, env) {
  return SECRET_NAMES.reduce((clean, name) => (env[name] ? clean.split(env[name]).join('[redacted]') : clean), String(text));
}

function logFailure(context, error, env) {
  console.error(redactSecrets(`[admin] ${context} failed: ${error && error.name}: ${error && error.message}`, env));
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

module.exports = { GENERIC_ERROR, SESSION_EXPIRED, NOT_SET_UP, WRONG_ORIGIN, sendJson, clientAddress, redactSecrets, logFailure, wait };
