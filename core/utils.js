const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ActivityType } = require('discord.js');
const { readFileSync, writeFileSync, mkdirSync, renameSync } = require('fs');
const { dirname } = require('path');
const config = require('./config');

/**
 * A timestamp in the operator's chosen format. `dateLocale` is a setting rather
 * than a constant because "01/09/2026" and "09/01/2026" are the same string to
 * a program and two different days to a reader.
 */
function nowStr() {
  return new Date().toLocaleString(config.dateLocale(), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** A date in the operator's chosen format, date only. */
function dateStr(date) {
  if (!date) return '';
  return date.toLocaleDateString(config.dateLocale());
}

/** A date and time in the operator's chosen format. */
function dateTimeStr(date) {
  if (!date) return '';
  return date.toLocaleString(config.dateLocale());
}

function makeEmbed({ title = '', description = '', color = null, thumbnail = true, footerText = null, guildName = '' } = {}) {
  const thumbUrl = config.thumbnailUrl();

  const embed = new EmbedBuilder()
    .setColor(color ?? config.embedColor())
    .setTitle(title || null)
    .setDescription(description || null);

  // No configured thumbnail means NO thumbnail. Passing an empty string to
  // setThumbnail is an invalid-URL error from Discord, not a quiet no-op, so
  // without this guard every embed would fail on an unbranded installation.
  if (thumbnail === true) {
    if (thumbUrl) embed.setThumbnail(thumbUrl);
  } else if (typeof thumbnail === 'string' && thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  const footer = footerText ?? (guildName ? `© ${guildName} • ${nowStr()}` : null);
  // Same for the footer icon: an empty iconURL is refused, so it is left off.
  if (footer) embed.setFooter(thumbUrl ? { text: footer, iconURL: thumbUrl } : { text: footer });

  return embed;
}

/**
 * The row of link buttons under a panel, built from `branding.links`.
 *
 * Returns an EMPTY ARRAY when nothing is configured, not a row with no buttons:
 * Discord refuses an ActionRow without components, so an unbranded installation
 * would fail to post the panel at all.
 *
 * @returns {ActionRowBuilder[]} zero or one row, ready to spread into `components`
 */
function linkRow() {
  const buttons = config.brandLinks().map(link =>
    new ButtonBuilder().setLabel(link.label).setStyle(ButtonStyle.Link).setURL(link.url));
  return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

/**
 * A configured button style name to the discord.js enum.
 *
 * Anything unrecognised becomes Secondary rather than throwing: a typo in a
 * style should give a grey button somebody notices, not a panel that refuses to
 * post with a discord.js error naming an enum the operator never saw.
 */
const BUTTON_STYLES = {
  primary:   ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success:   ButtonStyle.Success,
  danger:    ButtonStyle.Danger,
};
function buttonStyle(name) {
  return BUTTON_STYLES[String(name ?? '').trim().toLowerCase()] ?? ButtonStyle.Secondary;
}

const ACTIVITY_TYPES = {
  playing:   ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching:  ActivityType.Watching,
  competing: ActivityType.Competing,
  custom:    ActivityType.Custom,
};

const PRESENCE_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);

/**
 * What a bot role should show under its name, or NULL when it should show
 * nothing at all.
 *
 * Null is a real answer, not a failure. The presence used to be a constant, so
 * every installation of this bot advertised one company's name under its own
 * bot. An unset text means no presence is set: the bot appears online with
 * nothing beneath it, which is what an unbranded bot should look like.
 *
 * @param {string} role 'commands' | 'events' | 'minigames'
 * @param {object} [vars] placeholder values for the text, e.g. {guild, members}
 */
function presenceOptions(role, vars = {}) {
  const cfg = config.get(`presence.${role}`, {});
  if (!cfg || cfg.enabled === false) return null;

  const raw = String(cfg.text ?? '').trim();
  if (!raw) return null;

  const name = raw.replace(/\{(\w+)\}/g, (whole, key) => {
    if (key === 'brand') return config.brandName() || vars.guild || whole;
    return (key in vars && vars[key] !== undefined && vars[key] !== null) ? String(vars[key]) : whole;
  }).trim();
  // A text made only of placeholders that resolved to nothing is not a name.
  if (!name) return null;

  const type = ACTIVITY_TYPES[String(cfg.type ?? '').trim().toLowerCase()] ?? ActivityType.Playing;
  const status = PRESENCE_STATUSES.has(String(cfg.status ?? '').trim().toLowerCase())
    ? String(cfg.status).trim().toLowerCase()
    : 'online';

  const activity = { name, type };
  // Only Streaming accepts a URL, and Discord ignores it elsewhere.
  const url = String(cfg.url ?? '').trim();
  if (type === ActivityType.Streaming && url) activity.url = url;

  return { activities: [activity], status };
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
  return roleIds.some(id => id && interaction.member?.roles?.cache?.has(id));
}

/**
 * May this member run something gated by `refs`?
 *
 * `refs` are config role references: names from the `roles` block or raw ids.
 *
 * AN EMPTY LIST MEANS EVERYONE, and that is a deliberate difference from an
 * unresolvable one. `roles: []` is an operator saying "no restriction";
 * `roles: ["moderator"]` where no moderator role is configured resolves to
 * nothing and DENIES. Treating both as "allow" is how a typo silently opens a
 * command to the whole server.
 */
function allowedByRoles(interaction, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return true;
  const ids = config.roleIds(refs);
  if (!ids.length) return false;
  return hasAnyRole(interaction, ...ids);
}

module.exports = {
  nowStr, dateStr, dateTimeStr,
  makeEmbed, linkRow, buttonStyle, presenceOptions,
  readJson, writeJson,
  hasAnyRole, allowedByRoles,
};
