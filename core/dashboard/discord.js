/**
 * A minimal Discord REST client for the dashboard process.
 *
 * The bot runs as a CHILD process, so the dashboard has no discord.js Client to
 * borrow, and starting a second one would open a second gateway session for the
 * same application. Plain REST with the bot token instead.
 *
 * The side effect is the useful one: this keeps working while the bot is
 * stopped or crashed, which is exactly the situation in which somebody needs
 * the dashboard most.
 */

const config = require('../config');

const API = 'https://discord.com/api/v10';

class DiscordApiError extends Error {
  constructor(status, body) {
    super(`Discord API ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Any of the three bot tokens will do for reading the guild.
 *
 * They may be three separate applications, but all three are in the same guild,
 * so whichever one is configured can answer "what roles does this server have".
 * Preferring the commands bot only makes the choice deterministic.
 */
function botToken() {
  return config.tokens.COMMANDS || config.tokens.EVENTS || config.tokens.MINIGAMES || '';
}

/**
 * One REST call with the bot token.
 *
 * Discord's per-route limits are dynamic and delivered in headers, so nothing
 * is hardcoded here: a 429 is honoured through its Retry-After and retried.
 */
async function request(pathname, { method = 'GET', body, token = null, retries = 2 } = {}) {
  const auth = token ?? botToken();
  if (!auth) throw new Error('No bot token is configured, so the dashboard cannot talk to Discord.');

  // Resolve and pin the target host. Path segments are snowflakes from the
  // database or from route params; concatenating them cannot change the host,
  // but verifying the origin anyway means a request can never be steered off
  // discord.com by a value that turns out not to be a snowflake after all.
  const url = new URL(`${API}${pathname}`);
  if (url.protocol !== 'https:' || url.host !== 'discord.com') {
    throw new Error(`Refusing a request to an unexpected host: ${url.host}`);
  }

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bot ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('retry-after') ?? 1);
    await new Promise(r => setTimeout(r, Math.min(retryAfter, 10) * 1000));
    return request(pathname, { method, body, token, retries: retries - 1 });
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

  if (!res.ok) throw new DiscordApiError(res.status, parsed);
  return parsed;
}

const getGuild = (guildId) => request(`/guilds/${guildId}`);
const getGuildRoles = (guildId) => request(`/guilds/${guildId}/roles`);
const getGuildChannels = (guildId) => request(`/guilds/${guildId}/channels`);

/** The member object including their role ids, or null when they are not in the guild. */
async function getGuildMember(guildId, userId) {
  try {
    return await request(`/guilds/${guildId}/members/${userId}`);
  } catch (err) {
    if (err instanceof DiscordApiError && err.status === 404) return null;
    throw err;
  }
}

async function getUser(userId) {
  try {
    return await request(`/users/${userId}`);
  } catch (err) {
    if (err instanceof DiscordApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Everything the permission layer needs about one member, resolved SERVER-SIDE
 * through the bot.
 *
 * Deliberately not taken from the user's own OAuth token: that would mean
 * trusting the client about their own roles, and it would force the extra
 * `guilds.members.read` scope on every login.
 */
async function resolveMemberContext(guildId, userId) {
  const [guild, member] = await Promise.all([
    getGuild(guildId),
    getGuildMember(guildId, userId),
  ]);
  return {
    inGuild: member !== null,
    isOwner: guild?.owner_id === userId,
    roleIds: member?.roles ?? [],
    nickname: member?.nick ?? null,
    guildName: guild?.name ?? null,
  };
}

const avatarUrl = (user) =>
  user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null;

// ── Name resolution ──────────────────────────────────────────────────────────
//
// The database only ever stores snowflakes, so without this every screen shows
// an 18-digit number where a human expects a name. There is no bulk endpoint,
// so they are resolved one by one and cached: a leaderboard of 25 rows would
// otherwise hammer the API on every render.

const USER_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_MAX = 500;
const userCache = new Map();

function cacheUser(id, value) {
  // A crude bound. A dashboard never sees enough distinct users for an LRU to
  // be worth the code, and dropping everything is fine because it is a cache.
  if (userCache.size >= USER_CACHE_MAX) userCache.clear();
  userCache.set(id, { value, at: Date.now() });
}

/** Resolve display names for a batch of ids to `{ [id]: {...} | null }`. */
async function resolveUsers(guildId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const now = Date.now();
  const out = {};

  await Promise.all(unique.map(async (id) => {
    const hit = userCache.get(id);
    if (hit && now - hit.at < USER_TTL_MS) { out[id] = hit.value; return; }

    const member = await getGuildMember(guildId, id).catch(() => null);
    let value = null;

    if (member?.user) {
      value = {
        id,
        name: member.nick || member.user.global_name || member.user.username,
        username: member.user.username ?? null,
        avatar: avatarUrl(member.user),
        inGuild: true,
      };
    } else {
      const user = await getUser(id).catch(() => null);
      if (user) {
        value = {
          id,
          name: user.global_name || user.username,
          username: user.username ?? null,
          avatar: avatarUrl(user),
          inGuild: false,
        };
      }
    }

    cacheUser(id, value);
    out[id] = value;
  }));

  return out;
}

/**
 * The roles, channels and categories of the guild, for the pickers in the
 * config UI. This is what turns "paste a snowflake" into "pick from a list",
 * which is most of the difference between a usable panel and a form.
 */
async function getGuildLookups(guildId) {
  const [roles, channels] = await Promise.all([
    getGuildRoles(guildId),
    getGuildChannels(guildId),
  ]);

  // 0 = text, 2 = voice, 4 = category, 5 = announcement.
  const byName = (a, b) => a.name.localeCompare(b.name);

  return {
    roles: (roles ?? [])
      .filter(r => r.name !== '@everyone')
      .map(r => ({ id: r.id, name: r.name, color: r.color }))
      .sort(byName),
    // Voice channels are in the list because the member-count channel usually
    // IS one: a voice channel nobody can join is the classic way to show a
    // number in the sidebar.
    channels: (channels ?? [])
      .filter(c => [0, 2, 5].includes(c.type))
      .map(c => ({ id: c.id, name: c.name, type: c.type }))
      .sort(byName),
    categories: (channels ?? [])
      .filter(c => c.type === 4)
      .map(c => ({ id: c.id, name: c.name }))
      .sort(byName),
  };
}

module.exports = {
  request, DiscordApiError, botToken,
  getGuild, getGuildRoles, getGuildChannels, getGuildMember, getUser,
  resolveMemberContext, getGuildLookups, resolveUsers,
};
