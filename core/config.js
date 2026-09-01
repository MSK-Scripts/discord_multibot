require('dotenv').config();

const { join } = require('path');

const BASE_DIR   = join(__dirname, '..');
const DATA_DIR   = join(BASE_DIR, 'data');
const ASSETS_DIR = join(BASE_DIR, 'assets');

const { mkdirSync } = require('fs');
mkdirSync(DATA_DIR,   { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// NO IDS IN THE SOURCE.
//
// Every id used to have MSK's own value as a default right here: the guild, all
// four staff roles, the self-assignable roles, the log and feedback channels. A
// fresh clone therefore pointed at somebody else's server, and any of those
// values silently kept working after being removed from a .env — which is the
// worse half, because a missing setting looked like a working one.
//
// Now an unset id is the empty string. `hasAnyRole` does `roles.cache.has('')`
// and answers false, so a missing role denies access rather than granting it,
// and `unset` below lists what is missing so main.js can say so at boot.
//
// NOTHING HERE CALLS process.exit(). A half-configured bot should start and run
// the parts that work: the alternative is that one forgotten channel id takes
// the whole installation down, and on a server with Restart=on-failure that
// becomes a crash loop nobody can read.
// ─────────────────────────────────────────────────────────────────────────────

/** Ids that were asked for and are not set. Reported once, at boot. */
const unset = [];

// Discord snowflakes are 18-digit numbers that exceed Number.MAX_SAFE_INTEGER.
// Always keep them as strings to avoid precision loss from parseInt / float64.
function _id(key) {
  const value = process.env[key];
  if (!value || !value.trim()) {
    unset.push(key);
    return '';
  }
  return value.trim();
}

function _str(key, def = '') {
  return process.env[key] || def;
}

const guild = {
  ID:                      _id('GUILD_ID'),
  LOG_CHANNEL_ID:          _id('LOG_CHANNEL_ID'),
  MEMBER_COUNT_CHANNEL_ID: _id('MEMBER_COUNT_CHANNEL_ID'),
  FEEDBACK_CHANNEL_ID:     _id('FEEDBACK_CHANNEL_ID'),
  MEMBER_ROLE_ID:          _id('MEMBER_ROLE_ID'),
  FOUNDER_ROLE_ID:         _id('FOUNDER_ROLE_ID'),
  MANAGER_ROLE_ID:         _id('MANAGER_ROLE_ID'),
  DEVELOPER_ROLE_ID:       _id('DEVELOPER_ROLE_ID'),
  GIVEAWAY_NOTIFY_ROLE_ID: _id('GIVEAWAY_NOTIFY_ROLE_ID'),
  TEAM_ROLE_ID:            _id('TEAM_ROLE_ID'),
  GARAGE_ROLE_ID:          _id('GARAGE_ROLE_ID'),
  HANDCUFFS_ROLE_ID:       _id('HANDCUFFS_ROLE_ID'),
  STORAGE_ROLE_ID:         _id('STORAGE_ROLE_ID'),
  VEHICLEKEYS_ROLE_ID:     _id('VEHICLEKEYS_ROLE_ID'),
};

const database = {
  HOST:     _str('DB_HOST', 'localhost'),
  USER:     _str('DB_USER'),
  PASSWORD: _str('DB_PASS'),
  NAME:     _str('DB_NAME', 'es_extended'),
};

const tokens = {
  COMMANDS:  _str('COMMANDS_BOT_TOKEN'),
  EVENTS:    _str('EVENTS_BOT_TOKEN'),
  MINIGAMES: _str('MINIGAMES_BOT_TOKEN'),
};

/**
 * What is missing, and whether that stops the bot from being useful.
 *
 * GUILD_ID is separated out because it is the one id nothing works without:
 * commands are registered per guild, so an empty value means every command
 * registration fails with a confusing permissions error rather than an obvious
 * "you did not configure the server".
 *
 * @returns {{unset: string[], guildMissing: boolean}}
 */
function report() {
  return { unset: [...unset], guildMissing: !guild.ID };
}

const EMBED_COLOR   = 0x5EB131;
const THUMBNAIL_URL = 'https://cdn.msk-scripts.de/brand/msk_logo.webp';

module.exports = {
  BASE_DIR, DATA_DIR, ASSETS_DIR,
  guild, database, tokens, report,
  EMBED_COLOR, THUMBNAIL_URL,
};
