const { EmbedBuilder } = require('discord.js');
const { readFileSync, writeFileSync, mkdirSync, renameSync } = require('fs');
const { dirname } = require('path');
const { EMBED_COLOR, THUMBNAIL_URL } = require('./config');

function nowStr() {
  return new Date().toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function makeEmbed({ title = '', description = '', color = EMBED_COLOR, thumbnail = true, footerText = null, guildName = '' } = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title || null)
    .setDescription(description || null);

  if (thumbnail === true) {
    embed.setThumbnail(THUMBNAIL_URL);
  } else if (typeof thumbnail === 'string' && thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  const footer = footerText ?? (guildName ? `© ${guildName} • ${nowStr()}` : null);
  if (footer) embed.setFooter({ text: footer, iconURL: THUMBNAIL_URL });

  return embed;
}

function readJson(path, def = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return def;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 4), 'utf8');
  renameSync(tmp, path);
}

// Role checks go by ID, never by name. `roles.cache` is keyed by role ID, so a
// plain `has()` is enough. Names are user-editable in the Discord UI: renaming a
// role used to revoke access silently, without any trace in the logs.
function hasAnyRole(interaction, ...roleIds) {
  return roleIds.some(id => id && interaction.member.roles.cache.has(id));
}

module.exports = { nowStr, makeEmbed, readJson, writeJson, hasAnyRole };
