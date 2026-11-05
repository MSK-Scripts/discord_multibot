/**
 * GitHub Sponsors -> a Discord role.
 *
 * THE SHOP DECIDES, THE BOT FOLLOWS. Linking a GitHub account, checking the
 * sponsorship and the first role grant all happen in the shop. The bot only
 * does three things: hand a member a signed link into the shop, post the panel
 * that offers that link, and once a day bring the role in line with the shop's
 * list of current sponsors.
 *
 * THE TOKEN AND THE LIST ARE A CONTRACT WITH THE SHOP. Both sides implement the
 * same format independently, so the field names, their ORDER in the JSON and
 * the "sponsor-link." prefix of the signed data are not details to tidy up.
 * The harness pins the token against a fixed vector computed outside this code.
 *
 * A LIST THAT DID NOT ARRIVE CHANGES NOTHING. Any non-200, an `ok` that is not
 * true, a timeout or a body that does not look exactly like the contract aborts
 * the whole sync, adds included. The alternative reading of "no list" is "no
 * sponsors", and that strips the role from every paying member because the shop
 * had a bad minute.
 */

const { createHmac, randomBytes } = require('crypto');
const config = require('./config');
const { t } = require('./i18n');

/** How long a link is valid, in seconds. The shop checks `exp` against its own clock. */
const LINK_TTL_SECONDS = 900;

/** Shorter secrets are refused: they are an HMAC key and a bearer token. */
const MIN_SECRET_LENGTH = 32;

const FETCH_TIMEOUT_MS = 15_000;
const FIRST_RUN_DELAY_MS = 60_000;

const SNOWFLAKE = /^\d{17,20}$/;

/** The custom id of the panel's button. Posted panels keep it for ever: never rename it. */
const VERIFY_BUTTON_ID = 'sponsor_verify';

// ─── the link token ──────────────────────────────────────────────────────────

/**
 * The signed token for one member's link into the shop.
 *
 * payload = {"v":1,"d":<discord id>,"g":<guild id>,"exp":<unix s>,"n":<nonce>}
 * token   = base64url(payload) "." base64url(HMAC-SHA256(secret, "sponsor-link." + b64))
 *
 * `now` and `nonce` are parameters so the harness can pin the output.
 */
function buildLinkToken({ secret, discordId, guildId, now = Date.now(), nonce = randomBytes(16).toString('hex') }) {
  if (!secret) throw new Error('buildLinkToken: no secret');
  const payload = {
    v: 1,
    d: String(discordId),
    g: String(guildId),
    exp: Math.floor(now / 1000) + LINK_TTL_SECONDS,
    n: String(nonce),
  };
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(`sponsor-link.${b64}`).digest('base64url');
  return `${b64}.${sig}`;
}

/** The shop's base URL without a trailing slash, or '' when it is unusable. */
function normalizeBaseUrl(raw) {
  const value = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { return ''; }
  // The sync sends a bearer secret to this address. Plain http is accepted for
  // a shop on the same machine and nowhere else.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return '';
  return value;
}

function startUrl(baseUrl, token) {
  return `${baseUrl}/api/sponsor/start?t=${encodeURIComponent(token)}`;
}

// ─── settings ────────────────────────────────────────────────────────────────

/**
 * Everything the feature needs, and what is missing.
 *
 * The secrets are read at call time rather than at require time, so the harness
 * can take one away and watch the feature turn itself off.
 */
function settings() {
  const cfg = config.get('features.sponsor', {}) ?? {};
  const secrets = config.sponsorSecrets();
  const hour = Number(cfg.syncHour);

  const s = {
    enabled:     cfg.enabled === true,
    roleId:      config.roleId(cfg.role ?? ''),
    baseUrl:     normalizeBaseUrl(cfg.shopBaseUrl),
    sponsorsUrl: /^https:\/\//i.test(String(cfg.sponsorsUrl ?? '').trim()) ? String(cfg.sponsorsUrl).trim() : '',
    syncHour:    Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4,
    linkSecret:  secrets.link,
    syncSecret:  secrets.sync,
  };

  const missing = [];
  if (!s.roleId) missing.push('features.sponsor.role');
  if (!s.baseUrl) missing.push('features.sponsor.shopBaseUrl');
  if (s.linkSecret.length < MIN_SECRET_LENGTH) missing.push(`SPONSOR_LINK_SECRET (.env, at least ${MIN_SECRET_LENGTH} characters)`);
  if (s.syncSecret.length < MIN_SECRET_LENGTH) missing.push(`SPONSOR_SYNC_SECRET (.env, at least ${MIN_SECRET_LENGTH} characters)`);
  s.missing = missing;
  s.ready = s.enabled && missing.length === 0;
  return s;
}

/** The personal link for a member, or null when the feature cannot sign one. */
function linkFor(discordId, guildId) {
  const s = settings();
  if (!s.enabled || !s.baseUrl || s.linkSecret.length < MIN_SECRET_LENGTH) return null;
  return startUrl(s.baseUrl, buildLinkToken({ secret: s.linkSecret, discordId, guildId }));
}

// ─── the members list ────────────────────────────────────────────────────────

/**
 * Fetch the shop's list of current sponsors.
 *
 * @returns {Promise<{ok: true, ids: Set<string>, count: number} | {ok: false, reason: string}>}
 */
async function fetchMembers({ baseUrl, secret, fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS }) {
  let res;
  try {
    res = await fetchImpl(`${baseUrl}/api/sponsor/members`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, reason: `request failed: ${err?.name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : err?.message ?? err}` };
  }

  if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` };

  let body;
  try { body = await res.json(); } catch { return { ok: false, reason: 'the body is not JSON' }; }

  if (!body || typeof body !== 'object' || body.ok !== true) return { ok: false, reason: '"ok" is not true' };
  if (!Array.isArray(body.members)) return { ok: false, reason: '"members" is not a list' };

  // One malformed row makes the whole list suspect. A list that cannot be read
  // is treated like a list that did not arrive.
  const ids = new Set();
  for (const [n, m] of body.members.entries()) {
    const id = String(m?.discordId ?? '').trim();
    if (!SNOWFLAKE.test(id)) return { ok: false, reason: `members[${n}].discordId is not a Discord id` };
    ids.add(id);
  }
  return { ok: true, ids, count: body.members.length };
}

// ─── the diff ────────────────────────────────────────────────────────────────

/**
 * Who gets the role and who loses it. Pure, so the harness can pin it.
 *
 * @param {Iterable<{id: string, bot: boolean, hasRole: boolean}>} members everyone in the guild
 * @param {Iterable<string>} listedIds the shop's current sponsors
 * @returns {{toAdd: string[], toRemove: string[], notInGuild: number}}
 */
function diffSponsorRoles(members, listedIds) {
  const listed = new Set(listedIds);
  const toAdd = [];
  const toRemove = [];
  const present = new Set();

  for (const m of members) {
    present.add(m.id);
    // A bot is never a sponsor and never loses a role it was given by hand.
    if (m.bot) continue;
    if (listed.has(m.id) && !m.hasRole) toAdd.push(m.id);
    else if (!listed.has(m.id) && m.hasRole) toRemove.push(m.id);
  }

  let notInGuild = 0;
  for (const id of listed) if (!present.has(id)) notInGuild++;
  return { toAdd, toRemove, notInGuild };
}

// ─── the sync ────────────────────────────────────────────────────────────────

let running = false;

/**
 * Bring the role in line with the shop's list.
 *
 * @returns {Promise<{ok: boolean, reason?: string, added?: number, removed?: number, failed?: number, listed?: number, notInGuild?: number}>}
 */
async function runSync(client, { fetchImpl } = {}) {
  if (running) return { ok: false, reason: 'busy' };
  running = true;
  try {
    const s = settings();
    if (!s.ready) {
      return { ok: false, reason: s.enabled ? `not configured: ${s.missing.join(', ')}` : 'switched off' };
    }

    const list = await fetchMembers({ baseUrl: s.baseUrl, secret: s.syncSecret, fetchImpl });
    if (!list.ok) {
      console.error(`[Sponsor] sync aborted, no roles changed: the members list could not be used (${list.reason}).`);
      return { ok: false, reason: list.reason };
    }

    const guildId = config.guildId();
    const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      console.error('[Sponsor] sync aborted: the configured guild is not available to this bot.');
      return { ok: false, reason: 'guild not found' };
    }

    const role = guild.roles.cache.get(s.roleId) ?? await guild.roles.fetch(s.roleId).catch(() => null);
    if (!role) {
      console.error('[Sponsor] sync aborted: the sponsor role does not exist in the guild.');
      return { ok: false, reason: 'role not found' };
    }
    if (role.editable === false) {
      console.error('[Sponsor] sync aborted: the sponsor role sits above the bot\'s highest role, so the bot cannot assign it.');
      return { ok: false, reason: 'role not editable' };
    }

    const all = await guild.members.fetch();
    const byId = new Map();
    const view = [];
    for (const member of all.values()) {
      byId.set(member.id, member);
      view.push({ id: member.id, bot: member.user?.bot === true, hasRole: member.roles.cache.has(s.roleId) });
    }

    const { toAdd, toRemove, notInGuild } = diffSponsorRoles(view, list.ids);
    let added = 0, removed = 0, failed = 0;

    for (const id of toAdd) {
      try { await byId.get(id).roles.add(role, t('sponsor.audit.added')); added++; }
      catch (err) { failed++; console.error(`[Sponsor] could not add the role to ${id}: ${err?.message ?? err}`); }
    }
    for (const id of toRemove) {
      try { await byId.get(id).roles.remove(role, t('sponsor.audit.removed')); removed++; }
      catch (err) { failed++; console.error(`[Sponsor] could not remove the role from ${id}: ${err?.message ?? err}`); }
    }

    const summary = { ok: true, added, removed, failed, listed: list.ids.size, notInGuild };
    console.log(`[Sponsor] sync done: ${added} added, ${removed} removed, ${failed} failed `
      + `(${list.ids.size} listed, ${notInGuild} not in the guild).`);
    return summary;
  } catch (err) {
    console.error(`[Sponsor] sync failed: ${err?.message ?? err}`);
    return { ok: false, reason: String(err?.message ?? err) };
  } finally {
    running = false;
  }
}

// ─── the schedule ────────────────────────────────────────────────────────────

/** Milliseconds from `now` until the next `hour`:00 in the machine's local time. */
function msUntilHour(now, hour) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

const timers = { first: null, daily: null };

/**
 * Called on ClientReady of the commands bot: once a minute after the start,
 * then every day at `syncHour`. A setTimeout chain rather than a cron
 * dependency; recomputing the delay each day keeps it on the hour across DST.
 */
function startSponsorSync(client) {
  const s = settings();
  if (!s.enabled) return false;
  if (!s.ready) {
    console.warn(`[Sponsor] switched on but not configured, the sync stays off. Missing: ${s.missing.join(', ')}`);
    return false;
  }

  stopSponsorSync();
  const run = () => runSync(client).catch(() => {});
  const scheduleDaily = () => {
    timers.daily = setTimeout(() => { run(); scheduleDaily(); }, msUntilHour(new Date(), settings().syncHour));
    timers.daily.unref?.();
  };

  timers.first = setTimeout(run, FIRST_RUN_DELAY_MS);
  timers.first.unref?.();
  scheduleDaily();

  console.log(`[Sponsor] sync scheduled: first run in ${FIRST_RUN_DELAY_MS / 1000} s, then daily at ${String(s.syncHour).padStart(2, '0')}:00.`);
  return true;
}

function stopSponsorSync() {
  clearTimeout(timers.first);
  clearTimeout(timers.daily);
  timers.first = timers.daily = null;
}

module.exports = {
  LINK_TTL_SECONDS, MIN_SECRET_LENGTH, VERIFY_BUTTON_ID,
  buildLinkToken, normalizeBaseUrl, startUrl, linkFor,
  settings, fetchMembers, diffSponsorRoles, runSync, msUntilHour,
  startSponsorSync, stopSponsorSync,
};
