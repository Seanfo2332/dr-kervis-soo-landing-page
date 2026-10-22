// node --test tests/api/
const test = require('node:test');
const assert = require('node:assert/strict');
const session = require('../../api/_lib/session.js');

const SECRET = 'a-long-random-test-secret-0123456789';
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

test('a fresh token verifies', () => {
  const token = session.createSessionToken(SECRET, NOW);
  assert.equal(session.verifySessionToken(token, SECRET, NOW + 1000), true);
});

test('a token expires after its lifetime', () => {
  const token = session.createSessionToken(SECRET, NOW, 60_000);
  assert.equal(session.verifySessionToken(token, SECRET, NOW + 59_000), true);
  assert.equal(session.verifySessionToken(token, SECRET, NOW + 61_000), false);
});

test('a token signed with another secret is rejected', () => {
  const token = session.createSessionToken('some-other-secret-value-xxxxxxxx', NOW);
  assert.equal(session.verifySessionToken(token, SECRET, NOW), false);
});

test('a tampered token is rejected', () => {
  const [expiry, nonce, signature] = session.createSessionToken(SECRET, NOW).split('.');
  assert.equal(session.verifySessionToken([Number(expiry) + 9_999_999, nonce, signature].join('.'), SECRET, NOW), false);
  const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
  assert.equal(session.verifySessionToken([expiry, nonce, flipped].join('.'), SECRET, NOW), false);
});

test('garbage tokens and a missing secret never verify', () => {
  for (const value of ['', 'x', 'a.b', 'a.b.c', '1.2.3.4', undefined, null, 42]) {
    assert.equal(session.verifySessionToken(value, SECRET, NOW), false);
  }
  const token = session.createSessionToken(SECRET, NOW);
  assert.equal(session.verifySessionToken(token, '', NOW), false);
  assert.throws(() => session.createSessionToken('', NOW));
  assert.throws(() => session.createSessionToken('short', NOW));
});

test('passwordMatches compares without caring about length leaks and rejects empty configuration', () => {
  assert.equal(session.passwordMatches('correct horse', 'correct horse'), true);
  assert.equal(session.passwordMatches('correct horsf', 'correct horse'), false);
  assert.equal(session.passwordMatches('short', 'a much longer expected password'), false);
  assert.equal(session.passwordMatches('', ''), false);
  assert.equal(session.passwordMatches('anything', ''), false);
  assert.equal(session.passwordMatches(undefined, 'secret'), false);
  assert.equal(session.passwordMatches({ toString: () => 'secret' }, 'secret'), false);
});

test('the cookie is locked down to the admin API', () => {
  const cookie = session.buildCookie('tok', 3600);
  for (const part of ['admin_session=tok', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/admin', 'Max-Age=3600']) {
    assert.ok(cookie.includes(part), `missing ${part}`);
  }
  assert.ok(session.clearCookie().includes('Max-Age=0'));
});

test('readCookie finds the session among other cookies', () => {
  assert.equal(session.readCookie('a=1; admin_session=abc.def.ghi; b=2', 'admin_session'), 'abc.def.ghi');
  assert.equal(session.readCookie('a=1', 'admin_session'), null);
  assert.equal(session.readCookie(undefined, 'admin_session'), null);
});

test('isAuthenticated needs a valid cookie', () => {
  const env = { SESSION_SECRET: SECRET };
  const token = session.createSessionToken(SECRET, NOW);
  assert.equal(session.isAuthenticated({ headers: { cookie: `admin_session=${token}` } }, env, NOW), true);
  assert.equal(session.isAuthenticated({ headers: { cookie: 'admin_session=nope' } }, env, NOW), false);
  assert.equal(session.isAuthenticated({ headers: {} }, env, NOW), false);
  assert.equal(session.isAuthenticated({ headers: { cookie: `admin_session=${token}` } }, {}, NOW), false);
});

test('isSameOrigin accepts only the site itself', () => {
  const request = (headers) => ({ headers });
  assert.equal(session.isSameOrigin(request({ origin: 'https://drkervis.com', host: 'drkervis.com' })), true);
  assert.equal(session.isSameOrigin(request({ origin: 'http://localhost:3000', host: 'localhost:3000' })), true);
  assert.equal(session.isSameOrigin(request({ origin: 'https://evil.example', host: 'drkervis.com' })), false);
  assert.equal(session.isSameOrigin(request({ origin: 'https://drkervis.com.evil.example', host: 'drkervis.com' })), false);
  assert.equal(session.isSameOrigin(request({ host: 'drkervis.com' })), false);
  assert.equal(session.isSameOrigin(request({ origin: 'null', host: 'drkervis.com' })), false);
  assert.equal(session.isSameOrigin(request({ origin: 'not a url', host: 'drkervis.com' })), false);
});

test('rate limiter blocks after too many failures and recovers after the window', () => {
  const limiter = session.createRateLimiter({ maxFailures: 3, windowMs: 1000 });
  assert.equal(limiter.isBlocked('1.2.3.4', 0), false);
  limiter.recordFailure('1.2.3.4', 0);
  limiter.recordFailure('1.2.3.4', 100);
  assert.equal(limiter.isBlocked('1.2.3.4', 200), false);
  limiter.recordFailure('1.2.3.4', 300);
  assert.equal(limiter.isBlocked('1.2.3.4', 400), true);
  assert.equal(limiter.isBlocked('5.6.7.8', 400), false);
  assert.equal(limiter.isBlocked('1.2.3.4', 1500), false);
  limiter.reset('1.2.3.4');
  assert.equal(limiter.isBlocked('1.2.3.4', 400), false);
});
