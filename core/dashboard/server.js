/**
 * The dashboard HTTP server.
 *
 * THE WHOLE SECURITY POSTURE IS ONE MIDDLEWARE CHAIN, DEFINED ONCE:
 *
 *   helmet/CSP -> trust proxy -> body limit -> global rate limit
 *     -> requireAuth -> origin check (non-GET) -> CSRF (non-GET)
 *     -> requirePermission(...) -> handler -> error normalizer
 *
 * Defining it once is the point: a route physically cannot forget a check,
 * because it never gets to run without one.
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');

const db = require('../db');
const sec = require('./security');
const settings = require('./settings');
const { selectAccessRows, resolvePermissions, hasPermission, canUseDashboard } = require('./permissions');
// Required as a namespace rather than destructured, so a test can stand in for
// the Discord calls. Destructuring here would freeze the real function into
// this module at require time and there would be no way past the network.
const discord = require('./discord');
const { buildAuthorizeUrl, exchangeCode, fetchOAuthUser } = require('./auth');
const { registerRoutes } = require('./routes');

const WEB_DIST = path.resolve(__dirname, '../../web/dist');

// Rate limit tiers. The login endpoints are far stricter than normal browsing:
// that is where somebody would grind, and a legitimate user hits them twice.
const LIMIT_GLOBAL = { limit: 240, windowMs: 60_000 };     // per IP
const LIMIT_AUTH   = { limit: 10, windowMs: 5 * 60_000 };  // per IP
const LIMIT_WRITE  = { limit: 60, windowMs: 60_000 };      // per user

/** Cookie parsing without pulling in cookie-parser. */
function parseCookies(req) {
  // A null-prototype object: a cookie literally named "__proto__" then becomes a
  // harmless own property instead of walking the prototype chain, so a crafted
  // Cookie header cannot pollute Object.prototype.
  const out = Object.create(null);
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

/**
 * A short-lived cache for Discord member lookups.
 *
 * Without it every single request would cost two Discord REST calls and burn
 * through the bot's global budget. The trade-off is that a ROLE change in
 * Discord takes up to a minute to show up. Permission changes made in the
 * dashboard are NOT cached: those come from the database and take effect at
 * once.
 */
const memberCache = new Map();
const MEMBER_TTL_MS = 60_000;

async function getMemberContext(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const hit = memberCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await discord.resolveMemberContext(guildId, userId);
  memberCache.set(key, { value, expiresAt: Date.now() + MEMBER_TTL_MS });
  return value;
}

const invalidateMemberCache = () => memberCache.clear();

async function startServer({ config, supervisor }) {
  // The dashboard is a separate process from the bot, so it needs its own
  // connection. It is the same database either way.
  await db.connect();

  const app = express();

  // Exactly ONE trusted reverse proxy, so Express resolves req.ip from the
  // rightmost X-Forwarded-For entry. Trusting the leftmost would let any client
  // spoof their IP and reset their own rate-limit bucket.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        // React sets element.style directly, which is an attribute style.
        'style-src-attr': ["'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https://cdn.discordapp.com'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
      },
    },
    // Only meaningful over HTTPS, harmless otherwise.
    hsts: config.publicUrl.startsWith('https://')
      ? { maxAge: 63072000, includeSubDomains: true, preload: true }
      : false,
    crossOriginEmbedderPolicy: false,
  }));

  // The body limit comes BEFORE parsing, so a huge payload is rejected rather
  // than buffered. The config editor sends whole files, hence 512kb.
  app.use(express.json({ limit: '512kb' }));

  app.use((req, res, next) => {
    req.cookies = parseCookies(req);
    req.clientIp = sec.getClientIp(req);
    next();
  });

  app.use((req, res, next) => {
    const key = `global:${req.clientIp}`;
    if (!sec.rateLimit(key, LIMIT_GLOBAL)) {
      res.set('Retry-After', String(sec.retryAfter(key)));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  });

  const secureCookie = config.publicUrl.startsWith('https://');
  const cookieBase = { httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/' };

  /**
   * A member's effective permissions, live from the database.
   *
   * Shared by the OAuth callback and requireAuth so both gate on the same
   * answer. Permissions are never baked into the session, so a revocation takes
   * effect on the very next request rather than when a token happens to expire.
   */
  async function loadPermissions(userId, roleIds, isOwner) {
    const rows = await db.getAccessRows();
    const { userRow, roleRows } = selectAccessRows(rows, userId, roleIds);
    return resolvePermissions({ isOwner, userRow, roleRows });
  }

  // ── OAuth ──────────────────────────────────────────────────────────────────

  app.get('/auth/login', (req, res) => {
    const key = `auth:${req.clientIp}`;
    if (!sec.rateLimit(key, LIMIT_AUTH)) {
      return res.status(429).send('Too many login attempts. Please try again later.');
    }
    const state = sec.createOAuthState();
    res.cookie(sec.STATE_COOKIE, state, { ...cookieBase, maxAge: sec.STATE_TTL_MS });
    res.redirect(buildAuthorizeUrl(config, state));
  });

  app.get('/auth/callback', async (req, res) => {
    const key = `auth:${req.clientIp}`;
    if (!sec.rateLimit(key, LIMIT_AUTH)) {
      return res.status(429).send('Too many login attempts. Please try again later.');
    }

    // The state cookie is cleared on EVERY path, success or failure, so a stale
    // state can never be replayed.
    const stateCookie = req.cookies[sec.STATE_COOKIE];
    res.clearCookie(sec.STATE_COOKIE, { path: '/' });

    const { code, state } = req.query;
    if (!code || !state || !stateCookie || !sec.safeEqual(state, stateCookie) || !sec.verifyOAuthState(state)) {
      return res.status(400).send('Login failed: invalid or expired state. Please try again.');
    }

    try {
      const token = await exchangeCode(config, String(code));
      const user = await fetchOAuthUser(token.access_token);

      // Membership is resolved server-side. Somebody who is not in the guild and
      // is not the owner never gets a session at all.
      const ctx = await getMemberContext(config.guildId, user.id);
      if (!ctx.inGuild && !ctx.isOwner) {
        return res.status(403).send('You are not a member of this server.');
      }

      // Staff only. A member with no permissions is turned away HERE rather than
      // handed a session that would only ever collect 403s.
      const permissions = await loadPermissions(user.id, ctx.roleIds, ctx.isOwner);
      if (!canUseDashboard({ isOwner: ctx.isOwner, permissions })) {
        return res.status(403).send('This dashboard is limited to staff. Ask a server administrator for access.');
      }

      const session = sec.createSession({ userId: user.id, name: user.displayName, avatar: user.avatar });
      res.cookie(sec.SESSION_COOKIE, session, { ...cookieBase, maxAge: sec.SESSION_TTL_MS });

      // The CSRF cookie is deliberately NOT httpOnly: the frontend has to read
      // it to echo it back in a header. That is the whole double-submit idea.
      res.cookie(sec.CSRF_COOKIE, sec.createCsrfToken(), {
        httpOnly: false, secure: secureCookie, sameSite: 'lax', path: '/', maxAge: sec.SESSION_TTL_MS,
      });

      res.redirect('/');
    } catch (err) {
      console.error('[Dashboard] OAuth callback failed:', err.message);
      res.status(500).send('Login failed. Please try again.');
    }
  });

  app.post('/auth/logout', (req, res) => {
    res.clearCookie(sec.SESSION_COOKIE, { path: '/' });
    res.clearCookie(sec.CSRF_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ── Auth and permissions ───────────────────────────────────────────────────

  async function requireAuth(req, res, next) {
    const session = sec.verifySession(req.cookies[sec.SESSION_COOKIE]);
    if (!session?.userId) return res.status(401).json({ error: 'Not signed in.' });

    try {
      const ctx = await getMemberContext(config.guildId, session.userId);
      if (!ctx.inGuild && !ctx.isOwner) {
        return res.status(403).json({ error: 'You are not a member of this server.' });
      }

      const permissions = await loadPermissions(session.userId, ctx.roleIds, ctx.isOwner);

      // Enforced live on every request, so revoking somebody's last permission
      // locks them out on the next call. The marker lets the UI show a clean
      // "staff only" screen instead of an endless sign-in loop.
      if (!canUseDashboard({ isOwner: ctx.isOwner, permissions })) {
        return res.status(403).json({ error: 'This dashboard is limited to staff members.', portalClosed: true });
      }

      req.auth = {
        userId: session.userId,
        name: session.name,
        avatar: session.avatar,
        isOwner: ctx.isOwner,
        roleIds: ctx.roleIds,
        permissions,
        guildId: config.guildId,
        guildName: ctx.guildName,
      };
      next();
    } catch (err) {
      next(err);
    }
  }

  /** Origin check plus CSRF token, on every state-changing method. */
  function requireCsrf(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD') return next();

    const origin = req.headers.origin;
    if (origin && origin !== config.publicUrl) {
      return res.status(403).json({ error: 'Bad origin.' });
    }
    if (!sec.verifyCsrf(req.cookies[sec.CSRF_COOKIE], req.headers[sec.CSRF_HEADER])) {
      return res.status(403).json({ error: 'Invalid CSRF token.' });
    }

    // A per-user write budget on top of the per-IP one. A browser client must
    // not be able to spend the bot's global Discord quota.
    const key = `write:${req.auth.userId}`;
    if (!sec.rateLimit(key, LIMIT_WRITE)) {
      res.set('Retry-After', String(sec.retryAfter(key)));
      return res.status(429).json({ error: 'Too many changes. Please slow down.' });
    }
    next();
  }

  /** @param {string|string[]} required an array means any-of. */
  function requirePermission(required) {
    return (req, res, next) => {
      if (!hasPermission(req.auth.permissions, required)) {
        return res.status(403).json({ error: 'You do not have permission to do this.' });
      }
      next();
    };
  }

  // ── API ────────────────────────────────────────────────────────────────────

  const api = express.Router();
  api.use(requireAuth);
  api.use(requireCsrf);

  api.get('/me', (req, res) => {
    res.json({
      user: { id: req.auth.userId, name: req.auth.name, avatar: req.auth.avatar },
      isOwner: req.auth.isOwner,
      permissions: req.auth.permissions,
      guild: { id: req.auth.guildId, name: req.auth.guildName },
    });
  });

  registerRoutes(api, { config, supervisor, requirePermission, invalidateMemberCache });

  app.use('/api', api);

  // ── Public appearance, before login ────────────────────────────────────────
  // Served without auth so the sign-in page is themed too. Registered BEFORE
  // the static handler so a custom favicon overrides the built-in one.

  app.get('/dashboard-settings.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(settings.publicSettings());
  });

  app.get('/favicon.ico', (req, res, next) => {
    const custom = settings.getFaviconFile();
    if (!custom) return next();
    res.setHeader('Content-Type', custom.mime);
    res.setHeader('Cache-Control', 'no-cache'); // revalidate, so a new upload shows
    res.sendFile(custom.file);
  });

  // ── The built UI ───────────────────────────────────────────────────────────

  /**
   * Caching, and why index.html MUST NOT be cached.
   *
   * Vite emits hashed asset names, so those are immutable and can be cached for
   * ever: a new build produces a new name. index.html is the opposite. Its name
   * never changes but its CONTENT points at the current bundle, so a cached one
   * keeps referencing a bundle that no longer exists after an update, and no
   * amount of normal reloading fixes it.
   */
  app.use(express.static(WEB_DIST, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
      else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  // The SPA fallback, as plain middleware rather than app.get('*'): Express 5
  // uses path-to-regexp v8, where a bare '*' is no longer a valid path and
  // throws at registration time.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();

    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(WEB_DIST, 'index.html'), (err) => {
      if (err) {
        res.status(500).send('The dashboard UI is not built. Run `npm run build` inside web/.');
      }
    });
  });

  // One error handler, so no route can accidentally leak a stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[Dashboard] route error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  // The listener is handed back, not swallowed: a test asks the OS for a free
  // port (port 0) and has to be able to read which one it got.
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(config.port, config.host, () => resolve(listener));
    listener.on('error', reject);
  });

  return { app, server, port: server.address().port };
}

module.exports = { startServer, parseCookies, WEB_DIST };
