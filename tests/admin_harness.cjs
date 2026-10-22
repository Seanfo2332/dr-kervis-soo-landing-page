// A local stand-in for Vercel, used by tests/verify_admin.cjs and for trying /admin by hand:
//   node tests/admin_harness.cjs 3100 [folder]
//   node tests/admin_harness.cjs 3100 --demo     (works on a temporary copy and rebuilds the pages after every publish)
//   node tests/admin_harness.cjs 3100 --demo --reuse <folder>   (carries on with an earlier demo's articles)
// It serves the static site and runs the real /api/admin functions, but "GitHub" is a plain folder
// (default: a fresh temporary one), so nothing is ever sent to GitHub, Vercel or Anthropic.
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseRecord } = require('../api/_lib/articles.js');

const root = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
const MAX_BODY_BYTES = 4.5 * 1024 * 1024;

// The same header rules Vercel applies in production (vercel.json), so the page is tested under its real security policy.
function headersFor(pathname) {
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers || [];
  const prefix = (rule) => rule.source.replace(/\/:path\*$/, '');
  return rules.filter((rule) => pathname === prefix(rule) || pathname.startsWith(`${prefix(rule)}/`)).flatMap((rule) => rule.headers);
}

function folderBackedGithub(folder, afterCommit) {
  return {
    async listRecords() {
      const directory = path.join(folder, 'content', 'insights');
      if (!fs.existsSync(directory)) return [];
      return fs.readdirSync(directory).filter((name) => name.endsWith('.json'))
        .map((name) => parseRecord(fs.readFileSync(path.join(directory, name), 'utf8'))).filter(Boolean);
    },
    async commit({ message, upserts, deletes }) {
      for (const file of upserts) {
        const target = path.join(folder, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content);
      }
      for (const file of deletes) fs.rmSync(path.join(folder, file), { force: true });
      fs.appendFileSync(path.join(folder, 'commits.log'), `${message}\n`);
      if (afterCommit) afterCommit();
      return 'local';
    },
  };
}

// Stands in for the AI so tests are fast, free and predictable.
const fakeSuggest = async ({ title }) => ({
  source: 'ai',
  fields: { summary: `自动摘要：${title}`, metaTitle: `搜索标题：${title}`, metaDescription: `搜索描述：${title}`, slug: 'auto-suggested-address' },
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('too large')); request.destroy(); } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function start({ port = 0, folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drk-admin-')), password = 'test-password-for-admin', siteRoot = root, afterCommit, suggest = fakeSuggest, anthropicKey } = {}) {
  const env = { ADMIN_PASSWORD: password, SESSION_SECRET: 'harness-secret-0123456789abcdef', GITHUB_TOKEN: 'harness-token', ANTHROPIC_API_KEY: anthropicKey };
  const github = folderBackedGithub(folder, afterCommit);
  const handlers = {
    session: require('../api/admin/session.js').createHandler({ env, sleep: async () => {} }),
    articles: require('../api/admin/articles.js').createHandler({ env, makeGithub: () => github, suggest }),
    suggest: require('../api/admin/suggest.js').createHandler({ env, makeGithub: () => github, suggest }),
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    for (const { key, value } of headersFor(url.pathname)) response.setHeader(key, value);
    if (url.pathname.startsWith('/api/')) {
      response.on('finish', () => console.log(`${new Date().toLocaleTimeString()} ${request.method} ${url.pathname}${url.search} -> ${response.statusCode}`));
    }
    if (url.pathname.startsWith('/api/admin/')) {
      const handler = handlers[url.pathname.replace(/\/$/, '').split('/').pop()];
      if (!handler) { response.statusCode = 404; return response.end(); }
      try {
        const raw = request.method === 'GET' || request.method === 'DELETE' ? '' : await readBody(request);
        request.query = Object.fromEntries(url.searchParams);
        request.body = raw ? JSON.parse(raw) : undefined;
      } catch {
        response.statusCode = 400;
        return response.end();
      }
      response.status = (code) => { response.statusCode = code; return response; };
      response.json = (payload) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(payload)); return response; };
      return handler(request, response);
    }
    let file = path.join(siteRoot, decodeURIComponent(url.pathname));
    // Vercel's cleanUrls: /landing/ is served from landing.html, /insights/ from insights/index.html.
    const cleanUrlFile = `${file.replace(/[\\/]+$/, '')}.html`;
    if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) {
      file = fs.existsSync(cleanUrlFile) ? cleanUrlFile : path.join(file, 'index.html');
    }
    if (!file.startsWith(siteRoot) || !fs.existsSync(file)) { response.statusCode = 404; return response.end('not found'); }
    response.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    return response.end(fs.readFileSync(file));
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    server, folder, password, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)),
  })));
}

module.exports = { start };

// A temporary copy of the project that is rebuilt after every publish, like Vercel does.
// Uses the real suggestion code: English words from the title as the address, or a real AI answer when
// ANTHROPIC_API_KEY is set in the environment. Pass an existing demo folder to carry on with its articles.
function startDemo(port, reuseFolder) {
  const skip = new Set(['.git', 'node_modules', '.vercel', '__pycache__']);
  const copy = reuseFolder || fs.mkdtempSync(path.join(os.tmpdir(), 'drk-demo-'));
  if (!reuseFolder) fs.cpSync(root, copy, { recursive: true, filter: (file) => !skip.has(path.basename(file)) });
  const rebuild = () => {
    try {
      execFileSync('python', ['scripts/build_site.py'], { cwd: copy, stdio: 'pipe' });
    } catch (error) {
      console.error(`Rebuild failed: ${error.message}`);
    }
  };
  return start({ port, folder: copy, siteRoot: copy, afterCommit: rebuild, suggest: require('../api/_lib/suggest.js').suggestFields, anthropicKey: process.env.ANTHROPIC_API_KEY });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const reuseIndex = args.indexOf('--reuse');
  const reuseFolder = reuseIndex >= 0 ? args[reuseIndex + 1] : undefined;
  const [port, folder] = args.filter((arg, index) => !arg.startsWith('--') && (reuseIndex < 0 || index !== reuseIndex + 1));
  const running = demo ? startDemo(Number(port) || 3100, reuseFolder) : start({ port: Number(port) || 3100, folder });
  running.then(({ url, folder: where, password }) => {
    console.log(`Admin test server: ${url}/admin/
Password: ${password}
Files are written to: ${where}`);
  });
}
