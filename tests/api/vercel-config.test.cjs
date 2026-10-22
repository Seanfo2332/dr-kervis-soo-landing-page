// node --test "tests/api/*.test.cjs"
// The security headers in vercel.json must match the addresses the site really serves. This site uses
// trailingSlash, so every address ends in "/", and Vercel turns "/admin/:path*" into a pattern that does NOT
// match "/admin/" (found on a real preview deployment). Rules therefore end in "/(.*)".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'vercel.json'), 'utf8'));
const rules = config.headers;
const headerNames = (rule) => rule.headers.map((header) => header.key);

// Only the one pattern form we allow: a literal prefix followed by "/(.*)".
function matches(source, address) {
  assert.match(source, /^\/[a-z/-]+\/\(\.\*\)$/, `unsupported or slash-unsafe pattern: ${source}`);
  const prefix = source.slice(0, -'(.*)'.length);
  return address.startsWith(prefix);
}

const rule = (prefix) => rules.find((candidate) => candidate.source.startsWith(`/${prefix}/`));

test('the admin page and every file under it get the strict headers', () => {
  const admin = rule('admin');
  assert.ok(admin, 'a rule for /admin/ exists');
  for (const address of ['/admin/', '/admin/admin.js', '/admin/admin.css', '/admin/paste.js']) {
    assert.equal(matches(admin.source, address), true, address);
  }
  const names = headerNames(admin);
  for (const name of ['Content-Security-Policy', 'Cache-Control', 'X-Robots-Tag', 'Referrer-Policy', 'X-Content-Type-Options']) {
    assert.ok(names.includes(name), `${name} is set`);
  }
});

test('every admin function address gets the no-store headers', () => {
  const api = rule('api');
  assert.ok(api, 'a rule for /api/ exists');
  for (const address of ['/api/admin/session/', '/api/admin/articles/', '/api/admin/suggest/']) {
    assert.equal(matches(api.source, address), true, address);
  }
  assert.ok(headerNames(api).includes('Cache-Control'));
});

test('the policy forbids inline scripts and styles and framing', () => {
  const policy = rule('admin').headers.find((header) => header.key === 'Content-Security-Policy').value;
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'(;|$)/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  assert.match(policy, /frame-ancestors 'none'/);
});

test('the build settings the deployment depends on are present', () => {
  assert.equal(config.buildCommand, 'python3 scripts/build_site.py');
  assert.equal(config.outputDirectory, '.');
  assert.equal(config.trailingSlash, true);
});
