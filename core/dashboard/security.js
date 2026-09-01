/**
 * Security primitives for the dashboard: sessions, CSRF, rate limiting and
 * client-IP resolution.
 *
 * Pure crypto and logic. No Express, no Discord, no database, so every rule
 * here can be tested on its own.
 */

const crypto = require('crypto');

const SESSION_COOKIE = 'mb_session';
const CSRF_COOKIE    = 'mb_csrf';
const CSRF_HEADER    = 'x-csrf-token';
const STATE_COOKIE   = 'mb_oauth_state';

const SESSION_TTL_MS = 60 * 60 * 1000;   // 1 h
const STATE_TTL_MS   = 10 * 60 * 1000;   // 10 min

/**
 * The signing secret.
 *
 * Deliberately lazy and throwing: there is NO fallback placeholder. A shipped
 * default would let anyone forge a session on every installation at once.
 */
function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters. Start the dashboard once and it generates one.');
  }
  return secret;
}

const b64url = (input) => Buffer.from(input).toString('base64url');

/**
 * Sign a payload for a specific scope. The scope is part of the signed data, so
 * a token minted for one purpose (the OAuth state) can never validate as
 * another (a session).
 */
function sign(scope, payloadB64) {
  return crypto.createHmac('sha256', getSecret())
    .update(`${scope}:${payloadB64}`)
    .digest('base64url');
}

/** Constant-time compare of two strings of arbitrary length. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  // timingSafeEqual throws on a length mismatch, so the length check comes
  // first. Length is not secret here: both sides are fixed-size digests.
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/**
 * A stateless, HMAC-signed token: base64url(json).base64url(signature)
 *
 * `exp` lives INSIDE the signed payload and is verified server-side. Relying on
 * the cookie's maxAge alone would be worthless: the cookie is under the
 * client's control and they can simply keep sending an expired one.
 */
function createToken(data, { scope = 'session', ttlMs = SESSION_TTL_MS } = {}) {
  const payload = { ...data, exp: Date.now() + ttlMs };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(scope, encoded)}`;
}

/**
 * Verify a token and return its payload, or null.
 * Rejects a bad shape, a tampered signature, the wrong scope, a missing `exp`
 * and an expired one.
 */
function verifyToken(token, { scope = 'session' } = {}) {
  if (typeof token !== 'string' || token.length === 0) return null;

  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;

  const encoded = token.slice(0, idx);
  const provided = token.slice(idx + 1);
  if (!safeEqual(provided, sign(scope, encoded))) return null;

  let data;
  try {
    data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  // A correctly signed token WITHOUT an exp must also be rejected, or a token
  // minted before exp existed would be valid for ever.
  if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;

  return data;
}

const createSession = (data) => createToken(data, { scope: 'session' });
const verifySession = (token) => verifyToken(token, { scope: 'session' });

/** OAuth state: signed and short lived, so it needs no server-side store. */
const createOAuthState = (data = {}) =>
  createToken({ ...data, nonce: crypto.randomBytes(16).toString('hex') },
    { scope: 'oauth', ttlMs: STATE_TTL_MS });
const verifyOAuthState = (token) => verifyToken(token, { scope: 'oauth' });

// ── CSRF (double submit) ─────────────────────────────────────────────────────
//
// The token sits in a NON-httpOnly cookie and has to be echoed back in a header.
// An attacker on another origin can make the browser SEND the cookie but cannot
// READ it to set the header, so they cannot produce a matching pair.

const createCsrfToken = () => crypto.randomBytes(32).toString('base64url');

function verifyCsrf(cookieToken, headerToken) {
  if (!cookieToken || !headerToken) return false;
  return safeEqual(cookieToken, headerToken);
}

// ── Client IP ────────────────────────────────────────────────────────────────

/**
 * The real client IP behind exactly ONE trusted reverse proxy.
 *
 * The RIGHTMOST X-Forwarded-For entry, not the leftmost. Each proxy APPENDS the
 * address it received the request from, so the rightmost entry is what our own
 * proxy saw, which is the real client. Everything to the left is attacker
 * controlled: a client can send `X-Forwarded-For: 1.2.3.4` and, if we keyed the
 * rate limit on the leftmost token, reset their own bucket at will.
 */
function getClientIp(req) {
  const strip = (ip) => String(ip).trim().replace(/^::ffff:/, '');

  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    const parts = String(xff).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return strip(parts[parts.length - 1]);
  }
  const real = req.headers?.['x-real-ip'];
  if (real) return strip(real);

  return strip(req.socket?.remoteAddress ?? '127.0.0.1');
}

// ── Rate limiting ────────────────────────────────────────────────────────────
//
// An in-memory fixed window, which is exactly right here: the dashboard is a
// single Node process. It does not survive a restart, and that is fine, because
// a restart only ever RESETS limits, it never grants extra access.

const buckets = new Map();

/** @returns {boolean} true = allowed, false = over the limit */
function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

/** Seconds until the bucket resets, for the Retry-After header. */
function retryAfter(key) {
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  return Math.max(0, Math.ceil((bucket.resetAt - Date.now()) / 1000));
}

function resetRateLimits() {
  buckets.clear();
}

// Drop expired buckets so the map cannot grow without bound. unref() so this
// timer never keeps the process alive on its own.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);
if (typeof sweeper.unref === 'function') sweeper.unref();

module.exports = {
  SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER, STATE_COOKIE,
  SESSION_TTL_MS, STATE_TTL_MS,
  getSecret, safeEqual,
  createToken, verifyToken,
  createSession, verifySession,
  createOAuthState, verifyOAuthState,
  createCsrfToken, verifyCsrf,
  getClientIp,
  rateLimit, retryAfter, resetRateLimits,
};
