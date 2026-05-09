require('dotenv').config();

const { join } = require('path');

const BASE_DIR   = join(__dirname, '..');
const DATA_DIR   = join(BASE_DIR, 'data');
const ASSETS_DIR = join(BASE_DIR, 'assets');

const { mkdirSync } = require('fs');
mkdirSync(DATA_DIR,   { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

// Discord snowflakes are 18-digit numbers that exceed Number.MAX_SAFE_INTEGER.
// Always keep them as strings to avoid precision loss from parseInt / float64.
function _id(key, def) {
  return process.env[key] ? process.env[key].trim() : String(def);
}

function _str(key, def = '') {
  return process.env[key] || def;
}

const guild = {
  ID:                      _id('GUILD_ID',                 '900394679634370640'),
  LOG_CHANNEL_ID:          _id('LOG_CHANNEL_ID',           '900394680137699389'),
  MEMBER_COUNT_CHANNEL_ID: _id('MEMBER_COUNT_CHANNEL_ID',  '1083912480503382119'),
  FEEDBACK_CHANNEL_ID:     _id('FEEDBACK_CHANNEL_ID',      '953762590285234196'),
  MEMBER_ROLE_ID:          _id('MEMBER_ROLE_ID',           '900395164470767616'),
  GIVEAWAY_NOTIFY_ROLE_ID: _id('GIVEAWAY_NOTIFY_ROLE_ID',  '1051120654063251476'),
  TEAM_ROLE_ID:            _id('TEAM_ROLE_ID',             '900395689182380073'),
  GARAGE_ROLE_ID:          _id('GARAGE_ROLE_ID',           '1016399984226205798'),
  HANDCUFFS_ROLE_ID:       _id('HANDCUFFS_ROLE_ID',        '988884703975178260'),
  STORAGE_ROLE_ID:         _id('STORAGE_ROLE_ID',          '1264596340009340948'),
  VEHICLEKEYS_ROLE_ID:     _id('VEHICLEKEYS_ROLE_ID',      '1281327553520468040'),
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

const EMBED_COLOR   = 0x5EB131;
const THUMBNAIL_URL = 'https://i.imgur.com/PizJGsh.png';

module.exports = { BASE_DIR, DATA_DIR, ASSETS_DIR, guild, database, tokens, EMBED_COLOR, THUMBNAIL_URL };
