// The /admin screens: sign in, the article list, and the new/edit and delete dialogs.
// All text from the server is put on the page with textContent, never as HTML.
import { api, ApiError } from '/admin/api.js';
import { prepareImage } from '/admin/image.js';
import { hasFormatting, htmlToArticleText } from '/admin/paste.js';

const $ = (id) => document.getElementById(id);
const views = { loading: $('loading-view'), login: $('login-view'), dashboard: $('dashboard-view') };
const editor = $('editor-dialog');
const remover = $('delete-dialog');
const FIELDS = { title: 'field-title', content: 'field-content', summary: 'field-summary', metaTitle: 'field-meta-title', metaDescription: 'field-meta-description', slug: 'field-slug' };
const PHOTO_HINT = '请选择一张 JPG、PNG 或 WebP 图片，系统会自动调整大小。';
const SESSION_EXPIRED = '登录已过期，请重新登录。';
const PASTE_NOTICE = '已按格式转换：标题和要点已自动识别，请检查后再发布。';
const ADDRESS_IDLE = '填好标题和内容后，会自动生成英文网址。';
const ADDRESS_WAIT = '正在生成英文网址……';
const ADDRESS_DONE = '（已自动生成，可以在「摘要与搜索设置」里修改）';
const ADDRESS_LATER = '（发布时会自动生成）';
const PHOTO_PENDING = '图片稍后显示';
const THUMBNAIL_RETRY_MS = 15000;
const THUMBNAIL_MAX_RETRIES = 12;

// `session` counts editor openings, so an answer that arrives after the editor was closed is ignored.
const ui = { articles: [], editingSlug: null, photo: null, snapshot: '', pendingDelete: null, session: 0, addressTyped: false, fillingAddress: false };

function show(name) {
  Object.entries(views).forEach(([key, element]) => { element.hidden = key !== name; });
}

function setText(element, text) {
  element.textContent = text || '';
  element.hidden = !text;
}

function goToLogin(message) {
  if (editor.open) editor.close();
  if (remover.open) remover.close();
  show('login');
  setText($('login-error'), message);
  $('login-password').value = '';
  $('login-password').focus();
}

// Runs an action with a button locked and relabelled. A lapsed login sends the editor back to sign in,
// except on the sign-in form itself, where a 401 simply means the password was wrong.
async function busy(button, label, action, errorElement, { expiresSession = true } = {}) {
  const labelElement = button.querySelector('.lbl') || button;
  const original = labelElement.textContent;
  button.disabled = true;
  labelElement.textContent = label;
  setText(errorElement, '');
  try {
    return await action();
  } catch (error) {
    if (expiresSession && error instanceof ApiError && error.status === 401) goToLogin(SESSION_EXPIRED);
    else setText(errorElement, error.message);
    return undefined;
  } finally {
    button.disabled = false;
    labelElement.textContent = original;
  }
}

const formatDate = (iso) => iso.replaceAll('-', '.');

// A photo is not on the live site until the rebuild after publishing finishes (about a minute), so a missing
// picture shows a calm note and is tried again instead of a broken-image icon.
function thumbnail(container, src, attempt = 0) {
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    container.textContent = PHOTO_PENDING;
    if (attempt < THUMBNAIL_MAX_RETRIES) {
      setTimeout(() => { if (container.isConnected) thumbnail(container, src, attempt + 1); }, THUMBNAIL_RETRY_MS);
    }
  });
  image.src = attempt ? `${src}?retry=${attempt}` : src;
  container.replaceChildren(image);
}

// ---------- article list ----------
function renderArticles() {
  const list = $('article-list');
  list.replaceChildren();
  $('empty-state').hidden = ui.articles.length > 0;
  const template = $('article-row-template');
  for (const article of ui.articles) {
    const row = template.content.firstElementChild.cloneNode(true);
    thumbnail(row.querySelector('.article-thumb'), article.thumbnail);
    row.querySelector('.article-title').textContent = article.title;
    row.querySelector('.article-summary').textContent = article.summary;
    const edited = article.modified !== article.published ? `　修改于 ${formatDate(article.modified)}` : '';
    row.querySelector('.article-meta').textContent = `已发布 ${formatDate(article.published)}${edited}`;
    row.querySelector('.view-link').href = `/insights/${article.slug}/`;
    row.querySelector('.edit-button').addEventListener('click', () => openEditor(article));
    row.querySelector('.delete-button').addEventListener('click', () => openDelete(article));
    list.append(row);
  }
}

async function loadArticles() {
  try {
    ui.articles = (await api.list()).articles;
    setText($('list-error'), '');
    renderArticles();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) goToLogin(SESSION_EXPIRED);
    else setText($('list-error'), error.message);
  }
}

async function showDashboard() {
  show('dashboard');
  await loadArticles();
}

// ---------- editor ----------
const readFields = () => Object.fromEntries(Object.entries(FIELDS).map(([key, id]) => [key, $(id).value]));
const snapshot = () => JSON.stringify([readFields(), Boolean(ui.photo)]);

function setPhotoPreview(src) {
  const preview = $('photo-preview');
  if (!src) {
    preview.replaceChildren();
    preview.hidden = true;
    return;
  }
  thumbnail(preview, src);
  preview.hidden = false;
}

function updateSlugPreview() {
  $('address-preview').textContent = $('field-slug').value.trim() || '……';
}

function resetEditor(article) {
  if (ui.photo) URL.revokeObjectURL(ui.photo.previewUrl);
  ui.photo = null;
  ui.session += 1;
  ui.addressTyped = false;
  ui.fillingAddress = false;
  ui.editingSlug = article ? article.slug : null;
  $('editor-form').reset();
  setPhotoPreview(null);
  $('photo-status').textContent = PHOTO_HINT;
  $('editor-title').textContent = article ? '编辑文章' : '新建文章';
  $('editor-submit').querySelector('.lbl').textContent = article ? '保存修改' : '发布文章';
  $('field-slug').readOnly = Boolean(article);
  $('optional-fields').open = false;
  setText($('form-error'), '');
  setText($('form-notice'), '');
  $('address-status').textContent = article ? '（发布后不能再修改）' : ADDRESS_IDLE;
  updateSlugPreview();
}

async function openEditor(summary) {
  resetEditor(summary);
  editor.showModal();
  if (summary) {
    $('editor-submit').disabled = true;
    try {
      const { article } = await api.get(summary.slug);
      Object.entries(FIELDS).forEach(([key, id]) => { $(id).value = article[key === 'content' ? 'body' : key] || ''; });
      setPhotoPreview(article.image.small);
      $('photo-status').textContent = '正在使用原来的图片。如要更换，请重新选择一张。';
      updateSlugPreview();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) goToLogin(SESSION_EXPIRED);
      else setText($('form-error'), error.message);
    } finally {
      $('editor-submit').disabled = false;
    }
  }
  ui.snapshot = snapshot();
  $('field-title').focus();
}

function requestCloseEditor() {
  if (snapshot() !== ui.snapshot && !window.confirm('关闭后，已填写的内容会丢失。确定要关闭吗？')) return;
  editor.close();
}

// Text copied from Word, Google Docs, ChatGPT and similar arrives as HTML. Convert it so its headings and
// bullets survive; plain text is left to the browser.
function pasteFormatted(event) {
  const html = event.clipboardData ? event.clipboardData.getData('text/html') : '';
  if (!html || !hasFormatting(html)) return;
  const text = htmlToArticleText(html);
  if (!text) return;
  event.preventDefault();
  const field = event.target;
  field.focus();
  if (!document.execCommand('insertText', false, text)) {
    field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  setText($('form-notice'), PASTE_NOTICE);
}

async function choosePhoto(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  $('photo-status').textContent = '正在处理图片……';
  try {
    const photo = await prepareImage(file);
    if (ui.photo) URL.revokeObjectURL(ui.photo.previewUrl);
    ui.photo = photo;
    setPhotoPreview(photo.previewUrl);
    $('photo-status').textContent = `已选择：${file.name}`;
  } catch (error) {
    $('photo-status').textContent = error.message;
  }
}

async function suggest() {
  const { title, content } = readFields();
  if (!title.trim() || !content.trim()) return setText($('form-error'), '请先填写文章标题和内容。');
  setText($('form-notice'), '');
  const result = await busy($('suggest-button'), '正在生成……', () => api.suggest(title, content), $('form-error'));
  if (!result) return undefined;
  const { summary, metaTitle, metaDescription, slug } = result.fields;
  $('field-summary').value = summary;
  $('field-meta-title').value = metaTitle;
  $('field-meta-description').value = metaDescription;
  if (!ui.editingSlug) {
    $('field-slug').value = slug;
    $('address-status').textContent = slug ? ADDRESS_DONE : ADDRESS_LATER;
  }
  updateSlugPreview();
  $('optional-fields').open = true;
  setText($('form-notice'), result.notice || '已生成，请检查后再发布。');
  return undefined;
}

// Once there is a title and an article, fills the empty English web address (and the other empty optional
// fields) by itself. It never touches an address the editor typed, and it never shows an error: if it cannot
// help, the server fills the address in when the article is published.
async function fillAddressAutomatically() {
  const { title, content, slug } = readFields();
  if (ui.editingSlug || ui.addressTyped || ui.fillingAddress || slug.trim() || !title.trim() || !content.trim()) return;
  const session = ui.session;
  ui.fillingAddress = true;
  $('address-status').textContent = ADDRESS_WAIT;
  try {
    const { fields } = await api.suggest(title, content);
    if (session !== ui.session) return;
    if (!ui.addressTyped && !$('field-slug').value.trim()) $('field-slug').value = fields.slug;
    [['field-summary', fields.summary], ['field-meta-title', fields.metaTitle], ['field-meta-description', fields.metaDescription]]
      .forEach(([id, value]) => { if (!$(id).value.trim()) $(id).value = value; });
    $('address-status').textContent = fields.slug ? ADDRESS_DONE : ADDRESS_LATER;
    updateSlugPreview();
  } catch (error) {
    if (session !== ui.session) return;
    if (error instanceof ApiError && error.status === 401) goToLogin(SESSION_EXPIRED);
    else $('address-status').textContent = ADDRESS_LATER;
  } finally {
    if (session === ui.session) ui.fillingAddress = false;
  }
}

function buildPayload() {
  const payload = readFields();
  if (ui.editingSlug) payload.slug = ui.editingSlug;
  if (ui.photo) payload.photo = { full: ui.photo.full, small: ui.photo.small, width: ui.photo.width, height: ui.photo.height };
  return payload;
}

function checkBeforeSending() {
  const { title, content } = readFields();
  if (!title.trim()) return '请填写文章标题。';
  if (!content.trim()) return '请粘贴文章内容。';
  if (!ui.editingSlug && !ui.photo) return '请上传一张文章图片。';
  return '';
}

async function submitEditor(event) {
  event.preventDefault();
  const problem = checkBeforeSending();
  if (problem) return setText($('form-error'), problem);
  const editing = Boolean(ui.editingSlug);
  const title = $('field-title').value.trim();
  const result = await busy($('editor-submit'), editing ? '正在保存……' : '正在发布……', () => (editing ? api.update(buildPayload()) : api.create(buildPayload())), $('form-error'));
  if (!result) return undefined;
  editor.close();
  setText($('banner'), editing ? `已保存《${title}》的修改，大约 1 分钟后网站会更新。` : `已发布《${title}》，大约 1 分钟后会出现在网站上。`);
  await loadArticles();
  return undefined;
}

// ---------- delete ----------
function openDelete(article) {
  ui.pendingDelete = article;
  $('delete-message').textContent = `确定要删除《${article.title}》吗？删除后，大约 1 分钟内会从网站上消失，而且无法恢复。`;
  setText($('delete-error'), '');
  remover.showModal();
}

async function confirmDelete(event) {
  event.preventDefault();
  const article = ui.pendingDelete;
  const result = await busy($('delete-confirm'), '正在删除……', () => api.remove(article.slug), $('delete-error'));
  if (!result) return;
  remover.close();
  setText($('banner'), `已删除《${article.title}》，大约 1 分钟后会从网站上消失。`);
  await loadArticles();
}

// ---------- start ----------
async function signIn(event) {
  event.preventDefault();
  const password = $('login-password').value;
  if (!password) return setText($('login-error'), '请输入管理密码。');
  const result = await busy($('login-button'), '正在登录……', () => api.login(password), $('login-error'), { expiresSession: false });
  if (result) {
    $('login-password').value = '';
    await showDashboard();
  }
  return undefined;
}

async function signOut() {
  await api.logout().catch(() => undefined);
  goToLogin('');
}

async function start() {
  try {
    const { authenticated } = await api.session();
    if (authenticated) await showDashboard();
    else goToLogin('');
  } catch (error) {
    goToLogin(error.message);
  }
}

$('login-form').addEventListener('submit', signIn);
$('logout-button').addEventListener('click', signOut);
$('new-article-button').addEventListener('click', () => openEditor(null));
$('editor-form').addEventListener('submit', submitEditor);
// Pressing Enter in a one-line box must not publish the article by accident.
$('editor-form').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
});
$('editor-close').addEventListener('click', requestCloseEditor);
$('editor-cancel').addEventListener('click', requestCloseEditor);
editor.addEventListener('cancel', (event) => {
  event.preventDefault();
  requestCloseEditor();
});
$('field-content').addEventListener('paste', pasteFormatted);
$('photo-input').addEventListener('change', choosePhoto);
$('suggest-button').addEventListener('click', suggest);
$('field-slug').addEventListener('input', () => {
  ui.addressTyped = true;
  updateSlugPreview();
});
$('field-title').addEventListener('change', fillAddressAutomatically);
$('field-content').addEventListener('change', fillAddressAutomatically);
$('delete-form').addEventListener('submit', confirmDelete);
$('delete-cancel').addEventListener('click', () => remover.close());
start();
