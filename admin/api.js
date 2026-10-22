// Talks to the /api/admin functions. Every error comes back as a plain Chinese message.
const NETWORK_ERROR = '无法连接到服务器，请检查网络后再试。';
const GENERIC_ERROR = '操作没有成功，请稍后再试。';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function call(method, url, body) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || GENERIC_ERROR, response.status);
  return data;
}

// The trailing slashes are required: the site's trailingSlash setting redirects the other form.
const SESSION = '/api/admin/session/';
const ARTICLES = '/api/admin/articles/';

export const api = {
  session: () => call('GET', SESSION),
  login: (password) => call('POST', SESSION, { password }),
  logout: () => call('DELETE', SESSION),
  list: () => call('GET', ARTICLES),
  get: (slug) => call('GET', `${ARTICLES}?slug=${encodeURIComponent(slug)}`),
  create: (article) => call('POST', ARTICLES, article),
  update: (article) => call('PUT', ARTICLES, article),
  remove: (slug) => call('DELETE', `${ARTICLES}?slug=${encodeURIComponent(slug)}`),
  suggest: (title, content) => call('POST', '/api/admin/suggest/', { title, content }),
};
