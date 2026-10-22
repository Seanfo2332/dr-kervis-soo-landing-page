// node --test "tests/api/*.test.cjs"
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGithubClient, GithubError } = require('../../api/_lib/github.js');

const REPO = 'owner/site';
const respond = (status, body, { text } = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body,
  text: async () => (text !== undefined ? text : JSON.stringify(body)),
});

// A tiny GitHub: routes are matched on "METHOD path"; every call is recorded.
function fakeGithub(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = new URL(url).pathname.replace(`/repos/${REPO}`, '') + new URL(url).search;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path, body, headers: options.headers });
    const handler = routes[`${method} ${path}`] || routes[`${method} ${path.split('?')[0]}`];
    if (!handler) return respond(404, { message: 'Not Found' });
    return typeof handler === 'function' ? handler({ body, calls }) : handler;
  };
  return { fetchImpl, calls };
}

const client = (fetchImpl) => createGithubClient({ token: 'tkn', repo: REPO, branch: 'main', fetchImpl });

test('requests carry the token and never leak it into the URL', async () => {
  const { fetchImpl, calls } = fakeGithub({ 'GET /contents/content/insights?ref=main': respond(200, []) });
  await client(fetchImpl).listRecords();
  assert.equal(calls[0].headers.Authorization, 'Bearer tkn');
  assert.ok(!calls[0].path.includes('tkn'));
});

test('listRecords reads every valid json record and ignores everything else', async () => {
  const goodRecord = { slug: 'good', image: { src: '/images/insights/good.webp', small: '/images/insights/good-640.webp' } };
  const { fetchImpl } = fakeGithub({
    'GET /contents/content/insights?ref=main': respond(200, [
      { name: 'good.json', type: 'file', path: 'content/insights/good.json' },
      { name: 'broken.json', type: 'file', path: 'content/insights/broken.json' },
      { name: 'README.md', type: 'file', path: 'content/insights/README.md' },
      { name: 'folder.json', type: 'dir', path: 'content/insights/folder.json' },
    ]),
    'GET /contents/content/insights/good.json?ref=main': respond(200, null, { text: JSON.stringify(goodRecord) }),
    'GET /contents/content/insights/broken.json?ref=main': respond(200, null, { text: '{nope' }),
  });
  assert.deepEqual(await client(fetchImpl).listRecords(), [goodRecord]);
});

test('listRecords treats a missing folder as an empty list', async () => {
  const { fetchImpl } = fakeGithub({});
  assert.deepEqual(await client(fetchImpl).listRecords(), []);
});

test('listRecords surfaces real failures', async () => {
  const { fetchImpl } = fakeGithub({ 'GET /contents/content/insights?ref=main': respond(401, { message: 'Bad credentials' }) });
  await assert.rejects(client(fetchImpl).listRecords(), (error) => error instanceof GithubError && error.status === 401);
});

function commitRoutes(overrides = {}) {
  return {
    'GET /git/ref/heads/main': respond(200, { object: { sha: 'head1' } }),
    'GET /git/commits/head1': respond(200, { tree: { sha: 'tree1' } }),
    'POST /git/blobs': ({ calls }) => respond(201, { sha: `blob${calls.filter((c) => c.path === '/git/blobs').length}` }),
    'POST /git/trees': respond(201, { sha: 'tree2' }),
    'POST /git/commits': respond(201, { sha: 'commit2' }),
    'PATCH /git/refs/heads/main': respond(200, { object: { sha: 'commit2' } }),
    ...overrides,
  };
}

test('commit writes every file as one commit and moves the branch', async () => {
  const { fetchImpl, calls } = fakeGithub(commitRoutes({ 'GET /contents/images/insights/old-640.webp?ref=main': respond(200, {}) }));
  const sha = await client(fetchImpl).commit({
    message: 'chore: publish insight x',
    upserts: [{ path: 'content/insights/x.json', content: '{"a":1}\n' }, { path: 'images/insights/x.webp', content: Buffer.from([1, 2, 3]) }],
    deletes: ['images/insights/old-640.webp'],
  });
  assert.equal(sha, 'commit2');
  const blobs = calls.filter((c) => c.path === '/git/blobs');
  assert.equal(blobs.length, 2);
  assert.deepEqual(blobs[0].body, { content: Buffer.from('{"a":1}\n').toString('base64'), encoding: 'base64' });
  assert.deepEqual(blobs[1].body, { content: Buffer.from([1, 2, 3]).toString('base64'), encoding: 'base64' });
  const tree = calls.find((c) => c.path === '/git/trees').body;
  assert.equal(tree.base_tree, 'tree1');
  assert.deepEqual(tree.tree, [
    { path: 'content/insights/x.json', mode: '100644', type: 'blob', sha: 'blob1' },
    { path: 'images/insights/x.webp', mode: '100644', type: 'blob', sha: 'blob2' },
    { path: 'images/insights/old-640.webp', mode: '100644', type: 'blob', sha: null },
  ]);
  assert.deepEqual(calls.find((c) => c.path === '/git/commits').body, { message: 'chore: publish insight x', tree: 'tree2', parents: ['head1'] });
  assert.deepEqual(calls.find((c) => c.method === 'PATCH').body, { sha: 'commit2', force: false });
});

test('commit skips deleting files that are already gone', async () => {
  const { fetchImpl, calls } = fakeGithub(commitRoutes());
  await client(fetchImpl).commit({ message: 'm', upserts: [{ path: 'content/insights/a.json', content: 'x' }], deletes: ['images/insights/gone.webp'] });
  assert.deepEqual(calls.find((c) => c.path === '/git/trees').body.tree.map((entry) => entry.path), ['content/insights/a.json']);
});

test('commit retries from the new branch head when someone else committed first', async () => {
  let refUpdates = 0;
  const { fetchImpl, calls } = fakeGithub(commitRoutes({
    'PATCH /git/refs/heads/main': () => (++refUpdates === 1 ? respond(422, { message: 'Update is not a fast forward' }) : respond(200, {})),
  }));
  const sha = await client(fetchImpl).commit({ message: 'm', upserts: [{ path: 'content/insights/a.json', content: 'x' }], deletes: [] });
  assert.equal(sha, 'commit2');
  assert.equal(refUpdates, 2);
  assert.equal(calls.filter((c) => c.path === '/git/ref/heads/main').length, 2);
  assert.equal(calls.filter((c) => c.path === '/git/blobs').length, 1, 'photos are uploaded once, not on every retry');
});

test('commit gives up after three clashes', async () => {
  const { fetchImpl } = fakeGithub(commitRoutes({ 'PATCH /git/refs/heads/main': respond(422, { message: 'Update is not a fast forward' }) }));
  await assert.rejects(client(fetchImpl).commit({ message: 'm', upserts: [{ path: 'content/insights/a.json', content: 'x' }], deletes: [] }), GithubError);
});

test('commit never moves the branch when a step fails', async () => {
  const { fetchImpl, calls } = fakeGithub(commitRoutes({ 'POST /git/trees': respond(500, { message: 'boom' }) }));
  await assert.rejects(client(fetchImpl).commit({ message: 'm', upserts: [{ path: 'content/insights/a.json', content: 'x' }], deletes: [] }), GithubError);
  assert.equal(calls.some((c) => c.method === 'PATCH'), false);
});

test('commit refuses unsafe paths', async () => {
  const { fetchImpl, calls } = fakeGithub(commitRoutes());
  for (const path of ['../x', '/etc/passwd', 'a/../../b', '.github/workflows/x.yml', 'scripts/build_site.py', 'api/admin/articles.js', 'vercel.json']) {
    await assert.rejects(client(fetchImpl).commit({ message: 'm', upserts: [{ path, content: 'x' }], deletes: [] }), /path/i, path);
  }
  await assert.rejects(client(fetchImpl).commit({ message: 'm', upserts: [], deletes: ['scripts/build_site.py'] }), /path/i);
  assert.equal(calls.length, 0, 'nothing is sent to GitHub');
});

test('commit needs at least one change', async () => {
  const { fetchImpl } = fakeGithub(commitRoutes());
  await assert.rejects(client(fetchImpl).commit({ message: 'm', upserts: [], deletes: [] }), /nothing/i);
});
