'use strict';
// Reads and writes the article files in the GitHub repository. Every write is one commit, and Vercel
// rebuilds the site from it. Only the article and photo folders can ever be written: the page generator,
// the functions and the deployment settings live in the same repository and must stay out of reach.

const MAX_COMMIT_ATTEMPTS = 3;
const MAX_RECORDS = 200;
const INSIGHTS_DIRECTORY = 'content/insights';
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const WRITABLE_PATH = new RegExp(`^(?:content/insights/${SLUG}\\.json|images/insights/${SLUG}(?:-640)?\\.(?:webp|jpg))$`);
const { parseRecord } = require('./articles.js');

class GithubError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

function createGithubClient({ token, repo, branch, fetchImpl = fetch }) {
  const base = `https://api.github.com/repos/${repo}`;
  const ref = encodeURIComponent(branch);

  async function request(method, path, body, accept = 'application/vnd.github+json') {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'drkervis-admin',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.ok) return response;
    let detail = '';
    try {
      detail = (await response.json()).message || '';
    } catch { /* the error body is optional */ }
    throw new GithubError(`GitHub ${method} ${path.split('?')[0]} failed (${response.status}) ${detail}`.trim(), response.status);
  }

  const json = async (method, path, body) => (await request(method, path, body)).json();

  async function exists(path) {
    try {
      await request('GET', `/contents/${path}?ref=${ref}`);
      return true;
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) return false;
      throw error;
    }
  }

  async function listRecords() {
    let entries;
    try {
      entries = await json('GET', `/contents/${INSIGHTS_DIRECTORY}?ref=${ref}`);
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) return [];
      throw error;
    }
    const files = entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json')).slice(0, MAX_RECORDS);
    const records = await Promise.all(files.map(async (file) => {
      const response = await request('GET', `/contents/${file.path}?ref=${ref}`, undefined, 'application/vnd.github.raw+json');
      return parseRecord(await response.text());
    }));
    return records.filter(Boolean);
  }

  const createBlob = async (file) => {
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content));
    const blob = await json('POST', '/git/blobs', { content: content.toString('base64'), encoding: 'base64' });
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
  };

  async function commit({ message, upserts, deletes }) {
    const paths = [...upserts.map((file) => file.path), ...deletes];
    if (paths.length === 0) throw new Error('Nothing to commit');
    const unsafe = paths.find((path) => !WRITABLE_PATH.test(path));
    if (unsafe !== undefined) throw new Error(`Refusing to write outside the insights folders: path "${unsafe}"`);

    const uploaded = await Promise.all(upserts.map(createBlob));
    const existing = [];
    for (const path of deletes) if (await exists(path)) existing.push({ path, mode: '100644', type: 'blob', sha: null });
    const entries = [...uploaded, ...existing];

    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
      const head = (await json('GET', `/git/ref/heads/${ref}`)).object.sha;
      const baseTree = (await json('GET', `/git/commits/${head}`)).tree.sha;
      const tree = await json('POST', '/git/trees', { base_tree: baseTree, tree: entries });
      const created = await json('POST', '/git/commits', { message, tree: tree.sha, parents: [head] });
      try {
        await json('PATCH', `/git/refs/heads/${ref}`, { sha: created.sha, force: false });
        return created.sha;
      } catch (error) {
        const lostRace = error instanceof GithubError && error.status === 422;
        if (!lostRace || attempt === MAX_COMMIT_ATTEMPTS) throw error;
      }
    }
    throw new GithubError('Could not update the branch', 422);
  }

  return { listRecords, commit };
}

module.exports = { createGithubClient, GithubError };
