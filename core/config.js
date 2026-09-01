require('dotenv').config();

const { join } = require('path');
const { mkdirSync, existsSync, readFileSync } = require('fs');

const { parseJsonc, deepMerge, getPath } = require('./jsonc');

const BASE_DIR    = join(__dirname, '..');
const DATA_DIR    = join(BASE_DIR, 'data');
const ASSETS_DIR  = join(BASE_DIR, 'assets');
const CONFIG_DIR  = join(BASE_DIR, 'config');
const LOCALES_DIR = join(BASE_DIR, 'locales');

const EXAMPLE_PATH = join(CONFIG_DIR, 'config.example.jsonc');
const CONFIG_PATH  = process.env.MULTIBOT_CONFIG || join(CONFIG_DIR, 'config.jsonc');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// TWO LAYERS, AND THE TRACKED ONE IS THE DEFAULTS.
//
// config.example.jsonc ships with the bot and is loaded first. The operator's
// config.jsonc is laid on top of it. A key the operator never mentions keeps
// the shipped value, so an update that introduces a setting does not require
// editing an existing installation's file — which is exactly how DATABASE_URL
// managed to exist in the code and be invisible to everyone setting the bot up.
//
// .ENV IS SECRETS ONLY. Tokens and database credentials. Everything that is not
// a credential lives in config.jsonc, where it can be read, diffed and edited
// by a human without a shell.
//
// NOTHING HERE CALLS process.exit(). A half-configured bot should start and run
// the parts that work: the alternative is that one forgotten channel id takes
// the whole installation down, and under Restart=on-failure that is a crash
// loop nobody can read. A broken config file is reported and the defaults are
// used, which is a bot that says what is wrong rather than one that is gone.
// ─────────────────────────────────────────────────────────────────────────────

/** Problems found while loading. Printed once, at boot, by main.js. */
let problems = [];
let merged = {};

function readJsoncFile(path, label) {
  if (!existsSync(path)) return null;
  const result = parseJsonc(readFileSync(path, 'utf8'), label);
  if (result.ok) {
    if (result.value && typeof result.value === 'object' && !Array.isArray(result.value)) return result.value;
    problems.push(`${label} does not contain a JSON object. Ignored.`);
    return null;
  }
  problems.push(...result.lines);
  return null;
}

function load() {
  problems = [];

  const defaults = readJsoncFile(EXAMPLE_PATH, 'config/config.example.jsonc');
  if (!defaults) {
    // The defaults are tracked, so their absence means a broken checkout rather
    // than a configuration mistake. Say so plainly instead of running on {}.
    problems.push('config/config.example.jsonc is missing or unreadable. The bot has no defaults to fall back on.');
  }

  const user = readJsoncFile(CONFIG_PATH, 'config/config.jsonc');
  if (!user && existsSync(CONFIG_PATH)) {
    problems.push('config/config.jsonc could not be read, running on the shipped defaults.');
  }

  merged = deepMerge(defaults ?? {}, user ?? {});
  return merged;
}

load();

/** True when the operator has a config file of their own at all. */
const hasUserConfig = () => existsSync(CONFIG_PATH);

// ─── generic access ──────────────────────────────────────────────────────────

/** Read a dot path out of the merged config. */
const get = (path, fallback = undefined) => getPath(merged, path, fallback);

// ─── secrets, from .env ──────────────────────────────────────────────────────

const _env = (key, def = '') => (process.env[key] ?? def).trim?.() ?? def;

const tokens = {
  COMMANDS:  _env('COMMANDS_BOT_TOKEN'),
  EVENTS:    _env('EVENTS_BOT_TOKEN'),
  MINIGAMES: _env('MINIGAMES_BOT_TOKEN'),
};

/** The FiveM server's MariaDB, read by /backup_database. The bot never writes there. */
const database = {
  HOST:     _env('DB_HOST', 'localhost'),
  USER:     _env('DB_USER'),
  PASSWORD: _env('DB_PASS'),
  NAME:     _env('DB_NAME', 'es_extended'),
};

// ─── ids ─────────────────────────────────────────────────────────────────────

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * The guild.
 *
 * GUILD_ID used to live in .env and is configuration, not a credential, so it
 * moved here. An old .env still works, loudly: a silent fallback is how a
 * setting ends up with two homes and one of them wins by accident.
 */
let warnedLegacyGuild = false;

function guildId() {
  const fromConfig = String(get('guildId', '') || '').trim();
  if (fromConfig) return fromConfig;
  const legacy = _env('GUILD_ID');
  if (legacy) {
    // Warned once. guildId() is called on every command registration, and a
    // list that grows by one line per call is a log nobody reads twice.
    if (!warnedLegacyGuild) {
      warnedLegacyGuild = true;
      problems.push('guildId is empty in config.jsonc, falling back to GUILD_ID from .env. Move it into config.jsonc.');
    }
    return legacy;
  }
  return '';
}

/**
 * Resolve a role reference to an id.
 *
 * A reference is either a key from the `roles` block or a raw snowflake, so an
 * operator can name the four roles the bot knows about once and then point
 * every command at them by name — renaming the role in Discord changes nothing.
 * Anything unresolvable becomes '', and a check against '' is false: A MISSING
 * ROLE DENIES, IT DOES NOT GRANT.
 */
function roleId(ref) {
  const value = String(ref ?? '').trim();
  if (!value) return '';
  if (SNOWFLAKE.test(value)) return value;
  const named = get(`roles.${value}`, '');
  return SNOWFLAKE.test(String(named ?? '').trim()) ? String(named).trim() : '';
}

/** Resolve a list of role references, dropping the ones that do not resolve. */
function roleIds(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.map(roleId).filter(Boolean);
}

/**
 * Resolve a channel reference: a key from the `channels` block, a raw
 * snowflake, or empty. `fallbackKey` names the channel to use when the first
 * reference is empty, which is what lets a feature say "the log channel unless
 * I was given one of my own".
 */
function channelId(ref, fallbackKey = '') {
  const value = String(ref ?? '').trim();
  if (SNOWFLAKE.test(value)) return value;
  if (value) {
    const named = String(get(`channels.${value}`, '') ?? '').trim();
    if (SNOWFLAKE.test(named)) return named;
  }
  if (fallbackKey) {
    const fb = String(get(`channels.${fallbackKey}`, '') ?? '').trim();
    if (SNOWFLAKE.test(fb)) return fb;
  }
  return '';
}

// ─── branding ────────────────────────────────────────────────────────────────

/** "#5865F2", "5865F2" or a number to a number. Falls back on anything unparsable. */
function parseColor(raw, fallback = 0x5865F2) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw ?? '').replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(text) && !/^[0-9a-fA-F]{3}$/.test(text)) return fallback;
  const full = text.length === 3 ? text.split('').map(c => c + c).join('') : text;
  const parsed = Number.parseInt(full, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const brandName    = () => String(get('branding.name', '') ?? '').trim();
const thumbnailUrl = () => String(get('branding.thumbnailUrl', '') ?? '').trim();
const embedColor   = () => parseColor(get('branding.color', ''), 0x5865F2);

/**
 * The link buttons under the panels. A list, not three fields, so a panel
 * renders however many are configured and none of them is required. An entry
 * without a URL is dropped; an empty result means the whole row is left off,
 * because Discord refuses an ActionRow with no components.
 */
function brandLinks() {
  const links = get('branding.links', []);
  if (!Array.isArray(links)) return [];
  return links
    .map(l => ({ label: String(l?.label ?? '').trim(), url: String(l?.url ?? '').trim() }))
    .filter(l => l.label && /^https?:\/\//i.test(l.url))
    .slice(0, 5);
}

// ─── commands ────────────────────────────────────────────────────────────────

/**
 * A command's settings by its stable KEY, which is what the code uses. The
 * `name` inside is what members type and may be changed freely: registration
 * and routing both read this table, so the two cannot drift apart.
 */
function command(key) {
  const entry = get(`commands.${key}`, null);
  const base = { enabled: true, name: key, description: '', roles: [] };
  if (!entry || typeof entry !== 'object') return base;
  const name = String(entry.name ?? '').trim() || key;
  return {
    enabled:     entry.enabled !== false,
    name,
    description: String(entry.description ?? '').trim(),
    roles:       Array.isArray(entry.roles) ? entry.roles : [],
  };
}

/** Every command key the config knows about. */
const commandKeys = () => Object.keys(get('commands', {}) ?? {});

/** A context menu's settings by key. Same shape as a command, minus a description. */
function contextMenu(key) {
  const entry = get(`features.contextMenus.${key}`, null);
  const base = { enabled: true, name: key, roles: [] };
  if (!entry || typeof entry !== 'object') return base;
  return {
    enabled: entry.enabled !== false,
    name:    String(entry.name ?? '').trim() || key,
    roles:   Array.isArray(entry.roles) ? entry.roles : [],
  };
}

// ─── features ────────────────────────────────────────────────────────────────

/** Is a feature switched on? An unknown feature is off, not on. */
const featureEnabled = (name) => get(`features.${name}.enabled`, false) === true;

/** Is a single minigame switched on? Requires the minigames feature itself too. */
const gameEnabled = (name) =>
  get('features.minigames.enabled', true) !== false && get(`features.minigames.games.${name}`, true) !== false;

// ─── reporting ───────────────────────────────────────────────────────────────

/**
 * What is missing, and whether it stops the bot from being useful.
 *
 * This is deliberately not a validator that refuses to boot. It is a list
 * somebody reads once at startup, so a forgotten channel id shows up as a line
 * in the log rather than as a feature that quietly does nothing for a month.
 *
 * @returns {{problems: string[], missing: string[], guildMissing: boolean, hasUserConfig: boolean}}
 */
function report() {
  const missing = [];
  const want = (label, value) => { if (!value) missing.push(label); };

  if (featureEnabled('logging'))     want('features.logging.channelId',     channelId(get('features.logging.channelId', ''), 'log'));
  if (featureEnabled('memberCount')) want('features.memberCount.channelId', channelId(get('features.memberCount.channelId', ''), 'memberCount'));
  if (featureEnabled('feedback'))    want('features.feedback.channelId',    channelId(get('features.feedback.channelId', ''), 'feedback'));

  if (featureEnabled('autoReply')) {
    if (!String(get('features.autoReply.trigger', '')).trim()) missing.push('features.autoReply.trigger');
    if (!roleId(get('features.autoReply.contactId', '')) && !SNOWFLAKE.test(String(get('features.autoReply.contactId', '')).trim())) {
      missing.push('features.autoReply.contactId');
    }
  }

  if (get('features.rules.button.enabled', false) === true && !roleId(get('features.rules.button.grantsRole', ''))) {
    missing.push('features.rules.button.grantsRole');
  }

  if (featureEnabled('backupDatabase') && !database.USER) missing.push('DB_USER (.env)');

  // A bonus role that does not resolve matches nobody, so the multiplier is
  // simply never applied and the player sees the ordinary payout. There is
  // nothing to notice, which is why it has to be said out loud. Shipped empty,
  // so this stays silent until somebody actually adds an entry.
  if (featureEnabled('minigames')) {
    const bonuses = get('features.minigames.multipliers', []);
    if (Array.isArray(bonuses)) {
      bonuses.forEach((m, n) => {
        if (m && typeof m === 'object' && !roleId(m.role)) {
          missing.push(`features.minigames.multipliers[${n}].role`);
        }
      });
    }
  }

  // Resolved BEFORE the problem list is copied: guildId() can add a line to it,
  // and reading the list first would report the state from one call ago.
  const guildMissing = !guildId();

  return {
    problems: [...problems],
    missing,
    guildMissing,
    hasUserConfig: hasUserConfig(),
  };
}

// ─── reload ──────────────────────────────────────────────────────────────────

/**
 * Re-read the files. Used by the harness and by the dashboard after a write;
 * the bot itself is restarted on a config change, because listeners and the
 * registered command list are built once at attach time and a live swap would
 * only half apply.
 */
function reload() {
  return load();
}

module.exports = {
  BASE_DIR, DATA_DIR, ASSETS_DIR, CONFIG_DIR, LOCALES_DIR,
  CONFIG_PATH, EXAMPLE_PATH,

  get, raw: () => merged, reload, load, hasUserConfig,

  tokens, database,
  guildId, roleId, roleIds, channelId,
  brandName, thumbnailUrl, embedColor, brandLinks, parseColor,
  command, commandKeys, contextMenu,
  featureEnabled, gameEnabled,
  language: () => String(get('language', 'en') || 'en'),
  dateLocale: () => String(get('dateLocale', 'en-GB') || 'en-GB'),

  report,
  SNOWFLAKE,
};
