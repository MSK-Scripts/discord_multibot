/**
 * The API.
 *
 * Every route here already sits behind requireAuth, the origin check and the
 * CSRF check — see the middleware chain in server.js. What each route adds is
 * the ONE permission it needs, and nothing else.
 */

const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const db = require('../db');
const config = require('../config');
const i18n = require('../i18n');
const settings = require('./settings');
const configFile = require('./configFile');
const features = require('./features');
// A namespace, not a destructure: see the note in server.js.
const discord = require('./discord');
const { setEnvValue, parseEnvFile } = require('./envFile');
const { buildMessage } = require('../messageComposer');
const {
  PERMISSIONS, PERMISSION_LABELS, isSubjectType, isPermission, checkSelfEdit, parsePermissions,
} = require('./permissions');

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * The .env keys the dashboard may touch.
 *
 * A allowlist, not a denylist: .env is the file with the tokens in it, and a
 * route that can write an arbitrary key there can write anything. SESSION_SECRET
 * is deliberately NOT here — rotating it signs everyone out, including whoever
 * clicked, and there is no reason to do it from a web form.
 */
const EDITABLE_ENV = Object.freeze([
  'COMMANDS_BOT_TOKEN', 'EVENTS_BOT_TOKEN', 'MINIGAMES_BOT_TOKEN',
  'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME',
  'DATABASE_URL', 'CLIENT_SECRET',
]);

/** Which of those are secret, so they are never sent back to the browser. */
const SECRET_ENV = new Set([
  'COMMANDS_BOT_TOKEN', 'EVENTS_BOT_TOKEN', 'MINIGAMES_BOT_TOKEN', 'DB_PASS', 'DATABASE_URL', 'CLIENT_SECRET',
]);

function registerRoutes(api, { config: dashCfg, supervisor, requirePermission, invalidateMemberCache }) {
  // ── status: what drives the tiles ──────────────────────────────────────────

  api.get('/status', requirePermission(['config.view', 'config.edit']), (req, res) => {
    const { effective, exists, error } = configFile.readConfig();
    const report = config.report();

    res.json({
      configExists: exists,
      configError: error,
      problems: report.problems,
      missing: report.missing,
      guildMissing: report.guildMissing,
      messageProblems: i18n.problems(),
      language: config.language(),
      languages: i18n.languages(),
      features: features.describe(effective),
      bot: supervisor.getState(),
    });
  });

  // ── configuration ──────────────────────────────────────────────────────────

  api.get('/config', requirePermission(['config.view', 'config.edit']), (req, res) => {
    const data = configFile.readConfig();
    res.json({
      defaults: data.defaults,
      overrides: data.overrides,
      effective: data.effective,
      raw: data.raw,
      exists: data.exists,
      error: data.error,
      example: configFile.readExampleRaw(),
    });
  });

  api.patch('/config', requirePermission('config.edit'), (req, res) => {
    const patch = req.body?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Expected a { patch: { "a.b": value } } body.' });
    }
    const result = configFile.applyConfigPatch(patch);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, overrides: result.overrides, restartRequired: true });
  });

  api.put('/config/raw', requirePermission('config.edit'), (req, res) => {
    const result = configFile.writeConfigRaw(req.body?.text ?? '');
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, restartRequired: true });
  });

  // ── messages ───────────────────────────────────────────────────────────────

  api.get('/texts', requirePermission(['config.view', 'config.edit']), (req, res) => {
    const { overrides, raw, exists, error } = configFile.readTexts();
    // Every key, with what ships, what is in force and whether it was changed.
    // Sent whole rather than paged: 360 short strings is a small payload, and
    // searching a complete list in the browser beats a round trip per keystroke.
    const entries = i18n.allKeys().map(key => ({
      key,
      shipped: i18n.defaultOf(key),
      current: i18n.raw(key) || i18n.defaultOf(key),
      overridden: Boolean(getOverride(overrides, key)),
    }));
    res.json({ entries, overrides, raw, exists, error, example: configFile.readTextsExampleRaw() });
  });

  api.patch('/texts', requirePermission('config.edit'), (req, res) => {
    const patch = req.body?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Expected a { patch: { "a.b": value } } body.' });
    }
    const result = configFile.applyTextsPatch(patch);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, overrides: result.overrides, restartRequired: true });
  });

  api.put('/texts/raw', requirePermission('config.edit'), (req, res) => {
    const result = configFile.writeTextsRaw(req.body?.text ?? '');
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, restartRequired: true });
  });

  // ── .env ───────────────────────────────────────────────────────────────────

  api.get('/env', requirePermission(['config.view', 'config.edit']), (req, res) => {
    let parsed = new Map();
    try {
      parsed = parseEnvFile(fs.readFileSync(require('./config').ENV_PATH, 'utf8'));
    } catch { /* no .env yet */ }

    // A secret is reported as SET or NOT SET and never sent back. Reading a
    // token out of the panel would make the panel as sensitive as the token.
    res.json({
      keys: EDITABLE_ENV.map(key => ({
        key,
        secret: SECRET_ENV.has(key),
        set: Boolean(parsed.get(key)?.value),
        value: SECRET_ENV.has(key) ? null : (parsed.get(key)?.value ?? ''),
      })),
    });
  });

  api.patch('/env', requirePermission('config.edit'), (req, res) => {
    const patch = req.body?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Expected a { patch: { KEY: value } } body.' });
    }

    const rejected = Object.keys(patch).filter(k => !EDITABLE_ENV.includes(k));
    if (rejected.length) {
      return res.status(400).json({ error: `Not editable from here: ${rejected.join(', ')}` });
    }

    const envPath = require('./config').ENV_PATH;
    let content = '';
    try { content = fs.readFileSync(envPath, 'utf8'); } catch { /* create it */ }

    for (const [key, value] of Object.entries(patch)) {
      // An empty string CLEARS the key rather than being rejected: that is how
      // somebody turns a feature off, and refusing it would leave a stale token
      // in the file with no way to remove it from here.
      content = setEnvValue(content, key, String(value ?? ''));
    }
    fs.writeFileSync(envPath, content, 'utf8');

    res.json({ ok: true, restartRequired: true });
  });

  // ── the guild, for the pickers ─────────────────────────────────────────────

  api.get('/guild', requirePermission(['config.view', 'config.edit', 'access.manage', 'announce.post']), async (req, res, next) => {
    try {
      res.json(await discord.getGuildLookups(dashCfg.guildId));
    } catch (err) {
      // The bot may be stopped or the token wrong. That is worth saying rather
      // than leaving every picker mysteriously empty.
      res.status(502).json({ error: `Could not read the server from Discord: ${err.message}` });
      void next;
    }
  });

  // ── bot control ────────────────────────────────────────────────────────────

  api.get('/bot', requirePermission('bot.control'), (req, res) => {
    res.json(supervisor.getState());
  });

  api.get('/bot/logs', requirePermission('bot.control'), (req, res) => {
    res.json({ lines: supervisor.getLogs() });
  });

  /**
   * The live log, as server-sent events.
   *
   * SSE rather than a WebSocket: it is one-way, it is plain HTTP so it needs no
   * extra dependency and no CSP change, and it reconnects on its own.
   */
  api.get('/bot/logs/stream', requirePermission('bot.control'), (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    send('state', supervisor.getState());
    for (const line of supervisor.getLogs().slice(-200)) send('log', line);

    const onLog = (line) => send('log', line);
    const onStatus = () => send('state', supervisor.getState());
    supervisor.on('log', onLog);
    supervisor.on('status', onStatus);

    // A comment frame every 25s. Without it an idle connection is dropped by
    // most reverse proxies after a minute and the console goes quiet with no
    // error anywhere.
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(ping);
      supervisor.off('log', onLog);
      supervisor.off('status', onStatus);
    });
  });

  for (const action of ['start', 'stop', 'restart']) {
    api.post(`/bot/${action}`, requirePermission('bot.control'), async (req, res) => {
      const result = await supervisor[action]();
      if (result && result.ok === false) return res.status(409).json(result);
      res.json({ ok: true, state: supervisor.getState() });
    });
  }

  /**
   * git pull, npm install, restart.
   *
   * Owner only, and deliberately not merely `bot.control`: this one runs
   * arbitrary code from whatever the remote happens to contain, which is a
   * bigger thing than restarting a process.
   */
  api.post('/bot/update', requirePermission('bot.control'), async (req, res) => {
    if (!req.auth.isOwner) {
      return res.status(403).json({ error: 'Only the server owner can pull and install a new version.' });
    }
    const result = await supervisor.update();
    if (!result.ok) return res.status(500).json(result);
    res.json(result);
  });

  // ── points ─────────────────────────────────────────────────────────────────

  api.get('/points', requirePermission(['points.view', 'points.manage']), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '25', 10) || 25, 1), 100);
      const rows = await db.topBalances(limit);
      const names = await discord.resolveUsers(dashCfg.guildId, rows.map(r => r.user_id)).catch(() => ({}));
      res.json({
        rows: rows.map(r => ({
          userId: r.user_id,
          balance: r.balance,
          user: names[r.user_id] ?? null,
        })),
      });
    } catch (err) { next(err); }
  });

  api.post('/points/:userId', requirePermission('points.manage'), async (req, res, next) => {
    const { userId } = req.params;
    if (!SNOWFLAKE.test(String(userId))) return res.status(400).json({ error: 'Not a Discord user id.' });

    const delta = Number(req.body?.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'delta has to be a non-zero number.' });
    }
    try {
      const result = await db.addBalance(String(userId), Math.trunc(delta));
      res.json({ ok: true, ...result });
    } catch (err) { next(err); }
  });

  // ── announcements ──────────────────────────────────────────────────────────

  api.post('/announce', requirePermission('announce.post'), async (req, res, next) => {
    const channelId = String(req.body?.channelId ?? '').trim();
    if (!SNOWFLAKE.test(channelId)) return res.status(400).json({ error: 'Pick a channel.' });

    // The same composer /send_message and /send_embed use, so a message
    // posted from here is the message the bot would have posted itself.
    const built = buildMessage({ ...(req.body ?? {}), guildName: req.auth?.guildName ?? '' });
    if (!built.ok) return res.status(400).json({ error: built.error });

    // The channel is checked against the guild's own list rather than taken on
    // trust. The token could otherwise be aimed at any channel of any server
    // the bot is in, from a panel whose whole scope is THIS server.
    let channel = null;
    try {
      const lookups = await discord.getGuildLookups(dashCfg.guildId);
      channel = lookups.channels.find(c => c.id === channelId) ?? null;
    } catch (err) {
      return res.status(502).json({ error: `Could not read the server from Discord: ${err.message}` });
    }
    if (!channel) return res.status(400).json({ error: 'That channel is not in this server.' });

    try {
      const message = await discord.postMessage(channelId, built.payload);
      // Posting as the bot leaves no trace of WHO asked for it, and the panel
      // keeps no history, so the dashboard's own log is the only record.
      console.log(`[announce] ${req.auth?.userId ?? 'unknown'} posted to #${channel.name} (${channelId}), message ${message?.id ?? '?'}`);
      res.json({
        ok: true,
        messageId: message?.id ?? null,
        url: message?.id ? `https://discord.com/channels/${dashCfg.guildId}/${channelId}/${message.id}` : null,
      });
    } catch (err) {
      // 403 is the one that happens in practice: the bot is in the server but
      // cannot write in that channel, or may not mention everyone. Saying so
      // beats a generic failure that sends somebody hunting through the token.
      if (err instanceof discord.DiscordApiError) {
        const detail = typeof err.body?.message === 'string' ? err.body.message : err.message;
        return res.status(err.status === 403 ? 403 : 502).json({
          error: err.status === 403
            ? `Discord refused it: ${detail}. Check the bot's permissions in #${channel.name}.`
            : `Discord refused it: ${detail}`,
        });
      }
      next(err);
    }
  });

  // ── announcement templates ─────────────────────────────────────────────────
  //
  // A template belongs to whoever wrote it. `shared` is the only thing that
  // makes it visible to the rest of the staff, and sharing it does NOT hand
  // over the right to change it: everyone can use a shared template, only its
  // owner can rewrite or delete it. Otherwise one person's saved text could be
  // silently replaced under everybody still relying on it.
  //
  // The guild owner is the exception, as everywhere else in this panel: they
  // can remove anything, or a template belonging to somebody who has left would
  // be stuck in the list for good.

  const canTouchTemplate = (req, row) => req.auth.isOwner || row.owner_id === req.auth.userId;
  const visibleTemplate = (req, row) => row.shared === true || row.owner_id === req.auth.userId;

  /** The row as the browser sees it. `mine` is what the UI gates its buttons on. */
  const templateOut = (req, row, names) => ({
    id: row.id,
    name: row.name,
    shared: row.shared === true,
    mine: row.owner_id === req.auth.userId,
    canEdit: canTouchTemplate(req, row),
    owner: names[row.owner_id] ?? null,
    mode: row.mode || 'embed',
    title: row.title ?? '',
    body: row.body ?? '',
    thumbnail: row.thumbnail ?? '',
    image: row.image ?? '',
    footer: row.footer ?? '',
    color: row.color ?? '',
    ping: row.ping || 'none',
    roleId: row.role_id ?? '',
    updatedAt: Number(row.updated_at) || 0,
  });

  api.get('/announce/templates', requirePermission('announce.post'), async (req, res, next) => {
    try {
      const rows = (await db.listTemplates()).filter(r => visibleTemplate(req, r));
      const names = await discord
        .resolveUsers(dashCfg.guildId, rows.map(r => r.owner_id))
        .catch(() => ({}));
      res.json({ templates: rows.map(r => templateOut(req, r, names)) });
    } catch (err) { next(err); }
  });

  api.put('/announce/templates', requirePermission('announce.post'), async (req, res, next) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'A template needs a name.' });
    if (name.length > 100) return res.status(400).json({ error: 'A template name can be at most 100 characters.' });

    // Validated through the very builder that will post it, so a template that
    // saves is a template that can be sent. Storing one that cannot is how
    // somebody finds out at the worst possible moment.
    const built = buildMessage({ ...(req.body ?? {}), guildName: req.auth?.guildName ?? '' });
    if (!built.ok) return res.status(400).json({ error: built.error });

    try {
      const id = String(req.body?.id ?? '').trim();
      let ownerId = req.auth.userId;

      if (id) {
        const existing = (await db.listTemplates()).find(r => r.id === id);
        if (!existing) return res.status(404).json({ error: 'That template is gone.' });
        if (!canTouchTemplate(req, existing)) {
          return res.status(403).json({ error: 'That template belongs to somebody else.' });
        }
        // The owner does not change when the guild owner edits it, or tidying
        // up somebody else's template would quietly take it away from them.
        ownerId = existing.owner_id;
      }

      const row = {
        id: id || crypto.randomUUID().replace(/-/g, ''),
        ownerId,
        name,
        shared: req.body?.shared === true,
        mode: req.body?.mode === 'text' ? 'text' : 'embed',
        title: String(req.body?.title ?? ''),
        body: String(req.body?.body ?? ''),
        thumbnail: String(req.body?.thumbnail ?? ''),
        image: String(req.body?.image ?? ''),
        footer: String(req.body?.footer ?? ''),
        color: String(req.body?.color ?? ''),
        ping: String(req.body?.ping ?? 'none'),
        roleId: String(req.body?.roleId ?? ''),
      };
      await db.setTemplate(row);

      const saved = (await db.listTemplates()).find(r => r.id === row.id);
      const names = await discord.resolveUsers(dashCfg.guildId, [saved.owner_id]).catch(() => ({}));
      res.json({ ok: true, template: templateOut(req, saved, names) });
    } catch (err) { next(err); }
  });

  api.delete('/announce/templates/:id', requirePermission('announce.post'), async (req, res, next) => {
    try {
      const existing = (await db.listTemplates()).find(r => r.id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'That template is gone.' });
      if (!canTouchTemplate(req, existing)) {
        return res.status(403).json({ error: 'That template belongs to somebody else.' });
      }
      res.json({ ok: await db.deleteTemplate(req.params.id) });
    } catch (err) { next(err); }
  });

  // ── access ─────────────────────────────────────────────────────────────────

  api.get('/access', requirePermission('access.manage'), async (req, res, next) => {
    try {
      const rows = await db.getAccessRows();
      const userIds = rows.filter(r => r.subject_type === 'user').map(r => r.subject_id);
      const names = userIds.length
        ? await discord.resolveUsers(dashCfg.guildId, userIds).catch(() => ({}))
        : {};

      res.json({
        permissions: PERMISSIONS,
        labels: PERMISSION_LABELS,
        rows: rows.map(r => ({
          subjectType: r.subject_type,
          subjectId: r.subject_id,
          permissions: parsePermissions(r.permissions),
          active: r.active !== false,
          label: r.label ?? null,
          user: r.subject_type === 'user' ? (names[r.subject_id] ?? null) : null,
          updatedAt: Number(r.updated_at) || null,
        })),
      });
    } catch (err) { next(err); }
  });

  api.put('/access', requirePermission('access.manage'), async (req, res, next) => {
    const { subjectType, subjectId, permissions, active = true, label = null } = req.body ?? {};

    if (!isSubjectType(subjectType)) return res.status(400).json({ error: 'subjectType has to be "user" or "role".' });
    if (!SNOWFLAKE.test(String(subjectId ?? ''))) return res.status(400).json({ error: 'subjectId is not a Discord id.' });
    if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions has to be an array.' });

    const unknown = permissions.filter(p => !isPermission(p));
    if (unknown.length) return res.status(400).json({ error: `Unknown permission: ${unknown.join(', ')}` });

    // Nobody may lock themselves out or grant themselves more than they have.
    const problem = checkSelfEdit({
      actorId: req.auth.userId,
      actorIsOwner: req.auth.isOwner,
      actorPermissions: req.auth.permissions,
      targetType: subjectType,
      targetId: String(subjectId),
      nextPermissions: permissions,
      nextActive: active !== false,
    });
    if (problem) return res.status(400).json({ error: problem });

    try {
      await db.setAccessRow({
        subjectType,
        subjectId: String(subjectId),
        permissions,
        active: active !== false,
        label: label ? String(label).slice(0, 100) : null,
      });
      // The member cache holds roles, not permissions, but a fresh grant is the
      // moment somebody reloads and expects to see the difference.
      invalidateMemberCache();
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  api.delete('/access/:subjectType/:subjectId', requirePermission('access.manage'), async (req, res, next) => {
    const { subjectType, subjectId } = req.params;
    if (!isSubjectType(subjectType)) return res.status(400).json({ error: 'Unknown subject type.' });

    if (!req.auth.isOwner && subjectType === 'user' && subjectId === req.auth.userId) {
      return res.status(400).json({ error: 'You cannot remove your own access.' });
    }

    try {
      const removed = await db.deleteAccessRow(subjectType, String(subjectId));
      invalidateMemberCache();
      if (!removed) return res.status(404).json({ error: 'No such entry.' });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ── dashboard appearance ───────────────────────────────────────────────────

  api.get('/settings', requirePermission(['settings.view', 'settings.edit']), (req, res) => {
    res.json(settings.loadSettings());
  });

  api.put('/settings', requirePermission('settings.edit'), (req, res) => {
    const result = settings.setAccent(req.body?.accent ?? null);
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, settings: settings.loadSettings() });
  });

  // The favicon arrives as raw bytes: the type is decided by the file's magic
  // bytes, never by a name the client chose.
  api.post('/settings/favicon',
    requirePermission('settings.edit'),
    express.raw({ type: '*/*', limit: settings.MAX_FAVICON_BYTES }),
    (req, res) => {
      const result = settings.setFavicon(req.body);
      if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
      res.json({ ok: true, ext: result.ext, version: result.version });
    });

  api.delete('/settings/favicon', requirePermission('settings.edit'), (req, res) => {
    settings.clearFavicon();
    res.json({ ok: true });
  });
}

/** Does the override object carry this dot path? */
function getOverride(overrides, key) {
  let node = overrides;
  for (const part of String(key).split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

module.exports = { registerRoutes, EDITABLE_ENV, SECRET_ENV };
