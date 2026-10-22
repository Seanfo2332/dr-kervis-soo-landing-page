'use strict';
// What an editor may send, and exactly which files each action adds, changes or deletes.
// These rules deliberately match scripts/insights_data.py, which checks every stored article again at build time.
const { randomBytes } = require('node:crypto');

const LIMITS = { title: 120, summary: 200, metaTitle: 80, metaDescription: 200, content: 60000 };
const FULL_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const SMALL_PHOTO_MAX_BYTES = 400 * 1024;
const MAX_PHOTO_SIDE = 10000;
const SUMMARY_PREVIEW_CHARACTERS = 80;
const BUILTIN_SLUGS = new Set(['ai-in-the-workflow', 'building-a-creator-ecosystem', 'business-with-social-purpose']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_PATH_PATTERN = /^\/images\/insights\/[a-z0-9]+(?:-[a-z0-9]+)*(?:-640)?\.(?:webp|jpg)$/;
const HEADING_LINE = /^#{1,3}(\s|$)/;
const BULLET_LINE = /^[-*•]\s/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const isValidSlug = (slug) => typeof slug === 'string' && slug.length <= 80 && SLUG_PATTERN.test(slug);
const firstCharacters = (text, count) => Array.from(text).slice(0, count).join('');
const contentLines = (content) => content.split('\n').map((line) => line.trim()).filter(Boolean);

function sniffImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  return null;
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

function todayInKualaLumpur(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function fallbackSlug(now = new Date(), random = () => randomBytes(2).toString('hex')) {
  return `insight-${todayInKualaLumpur(now).replace(/-/g, '')}-${random()}`;
}

function deriveSummary(content) {
  const line = contentLines(String(content)).find((text) => !HEADING_LINE.test(text) && !BULLET_LINE.test(text));
  if (!line) return '';
  return Array.from(line).length > SUMMARY_PREVIEW_CHARACTERS ? `${firstCharacters(line, SUMMARY_PREVIEW_CHARACTERS)}…` : line;
}

// A suggested web address that is already in use gets -2, -3, ... so two articles never clash.
function uniqueSlug(slug, takenSlugs) {
  if (!slug) return '';
  const isTaken = (candidate) => takenSlugs.has(candidate) || BUILTIN_SLUGS.has(candidate);
  let candidate = slug;
  for (let number = 2; isTaken(candidate); number += 1) candidate = `${slug}-${number}`;
  return candidate;
}

const hasBodyText = (content) => contentLines(content).some((line) => !HEADING_LINE.test(line));

function readText(raw, field, label, { required = false, multiline = false } = {}) {
  const value = raw[field] === undefined || raw[field] === null ? '' : raw[field];
  if (typeof value !== 'string') return { error: `${label}的格式不正确。` };
  const text = (multiline ? value.replace(/\r\n?/g, '\n') : value).trim();
  if (required && !text) return { error: `请填写${label}。` };
  if (Array.from(text).length > LIMITS[field]) return { error: `${label}太长，最多 ${LIMITS[field]} 个字。` };
  if (text.includes('\u0000') || (!multiline && /[\r\n]/.test(text))) return { error: `${label}含有不能使用的字符或换行。` };
  return { text };
}

function decodeBase64(value) {
  return typeof value === 'string' && value.length % 4 === 0 && BASE64_PATTERN.test(value) ? Buffer.from(value, 'base64') : null;
}

const isSide = (value) => Number.isInteger(value) && value >= 1 && value <= MAX_PHOTO_SIDE;

function readPhoto(raw) {
  if (raw === undefined || raw === null) return { photo: null };
  const bad = { error: '图片处理失败，请换一张图片再试。' };
  if (typeof raw !== 'object' || !isSide(raw.width) || !isSide(raw.height)) return bad;
  const full = decodeBase64(raw.full);
  const small = decodeBase64(raw.small);
  const ext = full && small ? sniffImage(full) : null;
  if (!ext || sniffImage(small) !== ext) return bad;
  if (full.length > FULL_PHOTO_MAX_BYTES || small.length > SMALL_PHOTO_MAX_BYTES) return { error: '图片太大，请换一张较小的图片。' };
  return { photo: { ext, full, small, width: raw.width, height: raw.height } };
}

function validateInput(raw, { requirePhoto }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '提交的内容不完整。' };
  const fields = [['title', '文章标题', { required: true }], ['content', '文章内容', { required: true, multiline: true }],
    ['summary', '摘要'], ['metaTitle', '搜索标题'], ['metaDescription', '搜索描述']];
  const value = {};
  for (const [field, label, options] of fields) {
    const result = readText(raw, field, label, options);
    if (result.error) return { ok: false, error: result.error };
    value[field] = result.text;
  }
  if (!hasBodyText(value.content)) return { ok: false, error: '文章内容里没有正文，请至少写一段文字。' };
  if (raw.slug !== undefined && raw.slug !== null && typeof raw.slug !== 'string') return { ok: false, error: '网址的格式不正确。' };
  value.slug = (raw.slug || '').trim();
  const photoResult = readPhoto(raw.photo);
  if (photoResult.error) return { ok: false, error: photoResult.error };
  if (requirePhoto && !photoResult.photo) return { ok: false, error: '请上传一张文章图片。' };
  return { ok: true, value: { ...value, photo: photoResult.photo } };
}

const imagePaths = (slug, ext) => ({ src: `/images/insights/${slug}.${ext}`, small: `/images/insights/${slug}-640.${ext}` });
const repoPath = (webPath) => webPath.replace(/^\//, '');
const recordPath = (slug) => `content/insights/${slug}.json`;
const toJson = (record) => `${JSON.stringify(record, null, 2)}\n`;

function photoUpserts(slug, photo) {
  const { src, small } = imagePaths(slug, photo.ext);
  return [{ path: repoPath(src), content: photo.full }, { path: repoPath(small), content: photo.small }];
}

function textFields(input) {
  const summary = input.summary || deriveSummary(input.content);
  return {
    title: input.title, summary,
    metaTitle: input.metaTitle || firstCharacters(input.title, LIMITS.metaTitle),
    metaDescription: input.metaDescription || summary,
    body: input.content,
  };
}

function chooseSlug({ requested, existingSlugs, now, random }) {
  const taken = (slug) => existingSlugs.has(slug) || BUILTIN_SLUGS.has(slug);
  if (requested) {
    if (!isValidSlug(requested)) return { error: '网址只能使用小写英文字母、数字和连字符。' };
    return taken(requested) ? { error: '这个网址已被使用，请换一个。', conflict: true } : { slug: requested };
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = fallbackSlug(now, random);
    if (!taken(slug)) return { slug };
  }
  return { error: '暂时无法生成网址，请稍后再试。' };
}

function planCreate({ input, existingSlugs, now = new Date(), random }) {
  if (!input.photo) return { error: '请上传一张文章图片。' };
  const chosen = chooseSlug({ requested: input.slug, existingSlugs, now, random });
  if (chosen.error) return { error: chosen.error, conflict: Boolean(chosen.conflict) };
  const today = todayInKualaLumpur(now);
  const record = {
    slug: chosen.slug, ...textFields(input),
    image: { ...imagePaths(chosen.slug, input.photo.ext), width: input.photo.width, height: input.photo.height, alt: firstCharacters(input.title, 200) },
    published: today, modified: today,
  };
  return { record, upserts: [{ path: recordPath(chosen.slug), content: toJson(record) }, ...photoUpserts(chosen.slug, input.photo)], deletes: [] };
}

function planUpdate({ input, existing, now = new Date() }) {
  const slug = existing.slug;
  const alt = firstCharacters(input.title, 200);
  const image = input.photo
    ? { ...imagePaths(slug, input.photo.ext), width: input.photo.width, height: input.photo.height, alt }
    : { ...existing.image, alt };
  const record = { slug, ...textFields(input), image, published: existing.published, modified: todayInKualaLumpur(now) };
  const upserts = [{ path: recordPath(slug), content: toJson(record) }, ...(input.photo ? photoUpserts(slug, input.photo) : [])];
  const replacedOldType = input.photo && image.src !== existing.image.src;
  return { record, upserts, deletes: replacedOldType ? [repoPath(existing.image.src), repoPath(existing.image.small)] : [] };
}

function planDelete(record) {
  const paths = [record && record.image && record.image.src, record && record.image && record.image.small];
  if (!record || !isValidSlug(record.slug) || !paths.every((path) => typeof path === 'string' && IMAGE_PATH_PATTERN.test(path))) {
    throw new Error('Refusing to delete: the record does not point at the insights folders');
  }
  return { upserts: [], deletes: [recordPath(record.slug), ...paths.map(repoPath)] };
}

function parseRecord(text) {
  try {
    const record = JSON.parse(text);
    const valid = record && isValidSlug(record.slug) && record.image && IMAGE_PATH_PATTERN.test(record.image.src) && IMAGE_PATH_PATTERN.test(record.image.small);
    return valid ? record : null;
  } catch {
    return null;
  }
}

function summarise(record) {
  const { slug, title, summary, published, modified } = record;
  return { slug, title, summary, published, modified, thumbnail: record.image.small };
}

module.exports = {
  BUILTIN_SLUGS, LIMITS, sniffImage, slugify, todayInKualaLumpur, fallbackSlug, isValidSlug, deriveSummary, uniqueSlug,
  validateInput, planCreate, planUpdate, planDelete, parseRecord, summarise,
};
