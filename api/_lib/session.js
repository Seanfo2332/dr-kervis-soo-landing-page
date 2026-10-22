'use strict';
// Login for the /admin page: one shared password, then a signed, expiring cookie.
// Nothing here talks to a database; the only secrets are two Vercel environment variables.
const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const COOKIE_NAME = 'admin_session';
const COOKIE_PATH = '/api/admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 16;
const MAX_TRACKED_CLIENTS = 1000;

const validSecret = (secret) => typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH;
const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url');
const digest = (value) => createHash('sha256').update(value).digest();

function createSessionToken(secret, now = Date.now(), ttlMs = SESSION_TTL_MS) {
  if (!validSecret(secret)) throw new Error('SESSION_SECRET must be at least 16 characters');
  const payload = `${now + ttlMs}.${randomBytes(12).toString('base64url')}`;
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !validSecret(secret)) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  if (Number(parts[0]) <= now) return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Hashing first makes both sides the same length, so timingSafeEqual never throws and length does not leak.
function passwordMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || expected === '') return false;
  return timingSafeEqual(digest(input), digest(expected));
}

function cookieAttributes(maxAgeSeconds) {
  return `HttpOnly; Secure; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=${maxAgeSeconds}`;
}

const buildCookie = (token, maxAgeSeconds) => `${COOKIE_NAME}=${token}; ${cookieAttributes(maxAgeSeconds)}`;
const clearCookie = () => `${COOKIE_NAME}=; ${cookieAttributes(0)}`;

function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function isAuthenticated(req, env = process.env, now = Date.now()) {
  return verifySessionToken(readCookie(req.headers.cookie, COOKIE_NAME), env.SESSION_SECRET, now);
}

// Browsers always send Origin on cross-site and same-site POST/PUT/DELETE; a missing or foreign one is refused.
function isSameOrigin(req) {
  const { origin, host } = req.headers;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Best effort only: each serverless instance keeps its own memory. It slows a script down; it is not a firewall.
function createRateLimiter({ maxFailures, windowMs }) {
  const failures = new Map();
  const recent = (key, now) => (failures.get(key) || []).filter((time) => now - time < windowMs);
  return {
    isBlocked: (key, now = Date.now()) => recent(key, now).length >= maxFailures,
    recordFailure(key, now = Date.now()) {
      if (failures.size >= MAX_TRACKED_CLIENTS) failures.clear();
      failures.set(key, [...recent(key, now), now]);
    },
    reset: (key) => { failures.delete(key); },
  };
}

module.exports = {
  COOKIE_NAME, SESSION_TTL_MS, isUsableSecret: validSecret, createSessionToken, verifySessionToken, passwordMatches,
  buildCookie, clearCookie, readCookie, isAuthenticated, isSameOrigin, createRateLimiter,
};
