'use strict';
const { createGithubClient } = require('./github.js');

const DEFAULT_REPOSITORY = 'Seanfo2332/dr-kervis-soo-landing-page';
const DEFAULT_BRANCH = 'master';

// Null when the access token has not been added to Vercel yet.
function githubFromEnv(env) {
  if (!env.GITHUB_TOKEN) return null;
  return createGithubClient({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO || DEFAULT_REPOSITORY, branch: env.GITHUB_BRANCH || DEFAULT_BRANCH });
}

module.exports = { githubFromEnv };
