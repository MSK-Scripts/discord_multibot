const { EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const { t } = require('../../../core/i18n');
const { dateStr } = require('../../../core/utils');
const config = require('../../../core/config');

/**
 * Server event logging.
 *
 * EVERY TITLE, FIELD NAME AND COLOUR IS CONFIGURATION. They were 25 embed
 * titles and 74 field labels written into this file in English, which made the
 * whole feature untranslatable and unbrandable: an operator running a German
 * server got German members and English log entries about them.
 *
 * Titles and labels come from the catalogue (`logging.*`), colours from
 * `features.logging.colors`, and each event can be switched off on its own in
 * `features.logging.events` — the listener is then never attached at all, see
 * bots/events/bot.js.
 */

const CHANNEL_TYPE_KEYS = {
  [ChannelType.GuildText]:         'text',
  [ChannelType.GuildVoice]:        'voice',
  [ChannelType.GuildCategory]:     'category',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildForum]:        'forum',
  [ChannelType.GuildStageVoice]:   'stage',
  [ChannelType.GuildMedia]:        'media',
};

function channelTypeName(type) {
  const key = CHANNEL_TYPE_KEYS[type];
  return key ? t(`logging.channelTypes.${key}`) : t('logging.channelTypes.unknown', { type });
}

/** A colour by role name from the config, falling back to a sensible constant. */
const FALLBACK_COLORS = {
  positive: 0x57F287,
  negative: 0xED4245,
  neutral:  0x5865F2,
  warning:  0xFEE75C,
  notice:   0xE67E22,
  muted:    0x95A5A6,
  special:  0x9B59B6,
};
function color(name) {
  return config.parseColor(config.get(`features.logging.colors.${name}`, ''), FALLBACK_COLORS[name] ?? 0x5865F2);
}

/** Shared field label. */
const f = (name, vars) => t(`logging.fields.${name}`, vars);

function nowUtc() {
  return new Date().toUTCString().replace('GMT', 'UTC');
}

/**
 * @param {string} event catalogue key, e.g. 'memberJoin'
 * @param {string} colorName key in features.logging.colors
 */
function embed(event, colorName, description = '') {
  return new EmbedBuilder()
    .setTitle(t(`logging.${event}.title`))
    .setDescription(description || null)
    .setColor(color(colorName))
    .setFooter({ text: nowUtc() });
}

// ─── delivery ─────────────────────────────────────────────────────────────────

/** Is this event switched on? Unknown events default to on, like a new one would. */
const on = (event) => config.get(`features.logging.events.${event}`, true) !== false;

const ignoredChannel = (channelId) =>
  (config.get('features.logging.ignoreChannels', []) || []).map(String).includes(String(channelId));

const ignoredUser = (userId) =>
  (config.get('features.logging.ignoreUsers', []) || []).map(String).includes(String(userId));

async function log(client, emb) {
  if (!config.featureEnabled('logging')) return;
  const channelId = config.channelId(config.get('features.logging.channelId', ''), 'log');
  if (!channelId) return;
  const channel = client.channels.cache.get(String(channelId));
  if (!channel) return;
  await channel.send({ embeds: [emb] }).catch(console.error);
}

async function getAuditUser(guild, action, targetId = null, maxAgeMs = null) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 5, type: action });
    for (const entry of logs.entries.values()) {
      if (targetId && entry.target?.id !== String(targetId)) continue;
      if (maxAgeMs && Date.now() - entry.createdTimestamp > maxAgeMs) continue;
      return entry.executor;
    }
  } catch { /* missing View Audit Log, which is not worth an error per event */ }
  return null;
}

/** An audit-log executor as a mention, or the word for "we do not know". */
const actorText = (actor) => (actor ? `${actor}` : t('common.unknown'));

// ─── Member events ────────────────────────────────────────────────────────────

async function onMemberJoin(member) {
  if (ignoredUser(member.id)) return;
  const e = embed('memberJoin', 'positive')
    .addFields(
      { name: f('user'),       value: `${member} (\`${member.user.username}\`)`, inline: true },
      { name: f('id'),         value: member.id, inline: true },
      { name: f('accountAge'), value: dateStr(member.user.createdAt), inline: true },
    )
    .setThumbnail(member.displayAvatarURL());
  await log(member.client, e);
}

async function onMemberRemove(member) {
  if (ignoredUser(member.id)) return;
  const actor = await getAuditUser(member.guild, AuditLogEvent.MemberKick, member.id, 5000);
  let e;
  if (actor) {
    if (!on('memberKick')) return;
    e = embed('memberKick', 'negative')
      .addFields(
        { name: f('user'),     value: `**${member.user.username}** (\`${member.id}\`)`, inline: true },
        { name: f('kickedBy'), value: `${actor}`, inline: true },
      );
  } else {
    if (!on('memberLeave')) return;
    const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.toString()).join(' ');
    e = embed('memberLeave', 'muted')
      .addFields({ name: f('user'), value: `**${member.user.username}** (\`${member.id}\`)`, inline: true });
    if (roles) e.addFields({ name: f('roles'), value: roles, inline: false });
  }
  e.setThumbnail(member.displayAvatarURL());
  await log(member.client, e);
}

async function onMemberUpdate(before, after) {
  if (ignoredUser(after.id)) return;

  if (on('usernameChange') && before.user.username !== after.user.username) {
    const e = embed('usernameChange', 'neutral')
      .addFields(
        { name: f('user'),   value: `${after}`, inline: false },
        { name: f('before'), value: before.user.username, inline: true },
        { name: f('after'),  value: after.user.username, inline: true },
      );
    await log(after.client, e);
  }

  if (on('nicknameChange') && before.nickname !== after.nickname) {
    const e = embed('nicknameChange', 'neutral')
      .addFields(
        { name: f('user'),   value: `${after}`, inline: false },
        { name: f('before'), value: before.nickname ?? t('common.none'), inline: true },
        { name: f('after'),  value: after.nickname ?? t('common.removed'), inline: true },
      );
    await log(after.client, e);
  }

  const beforeTimeout = before.communicationDisabledUntil;
  const afterTimeout = after.communicationDisabledUntil;
  if (!beforeTimeout && afterTimeout && on('memberTimeout')) {
    const actor = await getAuditUser(after.guild, AuditLogEvent.MemberUpdate, after.id, 5000);
    const e = embed('memberTimeout', 'notice')
      .addFields(
        { name: f('user'),       value: `${after}`, inline: true },
        { name: f('until'),      value: afterTimeout.toUTCString(), inline: true },
        { name: f('timedOutBy'), value: actorText(actor), inline: true },
      );
    await log(after.client, e);
  } else if (beforeTimeout && !afterTimeout && on('memberTimeoutEnd')) {
    const actor = await getAuditUser(after.guild, AuditLogEvent.MemberUpdate, after.id, 5000);
    const e = embed('memberTimeoutEnd', 'positive')
      .addFields(
        { name: f('user'),      value: `${after}`, inline: true },
        { name: f('removedBy'), value: actorText(actor), inline: true },
      );
    await log(after.client, e);
  }

  const added = after.roles.cache.filter(r => !before.roles.cache.has(r.id));
  // Deleted roles are excluded: they no longer exist in the guild cache and are
  // already reported by onRoleDelete. Without this, every member who had the
  // role produces a separate entry.
  const removed = before.roles.cache.filter(r => !after.roles.cache.has(r.id) && after.guild.roles.cache.has(r.id));

  if (!added.size && !removed.size) return;
  const actor = await getAuditUser(after.guild, AuditLogEvent.MemberRoleUpdate, after.id);

  if (added.size && on('roleGiven')) {
    const e = embed('roleGiven', 'positive')
      .addFields(
        { name: f('user'),    value: `${after}`, inline: true },
        { name: f('roles'),   value: added.map(r => r.toString()).join(' '), inline: true },
        { name: f('addedBy'), value: actorText(actor), inline: true },
      );
    await log(after.client, e);
  }

  if (removed.size && on('roleRemoved')) {
    const e = embed('roleRemoved', 'negative')
      .addFields(
        { name: f('user'),      value: `${after}`, inline: true },
        { name: f('roles'),     value: removed.map(r => r.toString()).join(' '), inline: true },
        { name: f('removedBy'), value: actorText(actor), inline: true },
      );
    await log(after.client, e);
  }
}

async function onMemberBan(guild, user) {
  if (ignoredUser(user.id)) return;
  const actor = await getAuditUser(guild, AuditLogEvent.MemberBanAdd, user.id, 5000);
  const e = embed('memberBan', 'negative')
    .addFields(
      { name: f('user'),     value: `**${user.username}** (\`${user.id}\`)`, inline: true },
      { name: f('bannedBy'), value: actorText(actor), inline: true },
    )
    .setThumbnail(user.displayAvatarURL());
  await log(guild.client, e);
}

async function onMemberUnban(guild, user) {
  if (ignoredUser(user.id)) return;
  const actor = await getAuditUser(guild, AuditLogEvent.MemberBanRemove, user.id);
  const e = embed('memberUnban', 'positive')
    .addFields(
      { name: f('user'),       value: `**${user.username}** (\`${user.id}\`)`, inline: true },
      { name: f('unbannedBy'), value: actorText(actor), inline: true },
    );
  await log(guild.client, e);
}

// ─── Message events ───────────────────────────────────────────────────────────

async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  if (ignoredChannel(message.channel.id) || ignoredUser(message.author.id)) return;

  let deleter = null;
  try {
    const logs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
    const entry = logs.entries.first();
    if (entry?.target?.id === message.author.id && entry.executor?.id !== message.author.id) {
      deleter = entry.executor;
    }
  } catch { /* missing View Audit Log */ }

  let content = message.content || f('noTextContent');
  if (content.length > 1000) content = content.slice(0, 1000) + '…';

  const e = embed('messageDelete', 'negative')
    .addFields(
      { name: f('author'),  value: `${message.author} (\`${message.author.username}\`)`, inline: true },
      { name: f('channel'), value: f('jumpChannel', { id: message.channel.id }), inline: true },
    );
  if (deleter) e.addFields({ name: f('deletedBy'), value: `${deleter}`, inline: true });
  e.addFields({ name: f('content'), value: `> ${content}`, inline: false });

  if (message.attachments.size) {
    e.addFields({
      name:  f('attachments', { count: message.attachments.size }),
      value: message.attachments.map(a => a.name).join(', '),
      inline: false,
    });
  }

  await log(message.client, e);
}

async function onBulkMessageDelete(messages) {
  const first = messages.first();
  if (!first?.guild) return;
  if (ignoredChannel(first.channel.id)) return;

  const actor = await getAuditUser(first.guild, AuditLogEvent.MessageBulkDelete, first.channel.id);
  const e = embed('messageBulkDelete', 'negative')
    .addFields(
      { name: f('channel'), value: f('jumpChannel', { id: first.channel.id }), inline: true },
      { name: f('deleted'), value: f('messageCount', { count: messages.size }), inline: true },
    );
  if (actor) e.addFields({ name: f('deletedBy'), value: `${actor}`, inline: true });
  await log(first.client, e);
}

async function onMessageEdit(before, after) {
  if (!before.guild || before.author?.bot) return;
  if (before.content === after.content) return;
  if (ignoredChannel(before.channel.id) || ignoredUser(before.author.id)) return;

  let bc = before.content || f('empty');
  let ac = after.content || f('empty');
  if (bc.length > 500) bc = bc.slice(0, 500) + '…';
  if (ac.length > 500) ac = ac.slice(0, 500) + '…';

  const e = embed('messageEdit', 'warning')
    .addFields(
      { name: f('author'),  value: `${before.author} (\`${before.author.username}\`)`, inline: true },
      { name: f('channel'), value: f('jumpChannel', { id: before.channel.id }), inline: true },
      { name: f('jumpTo'),  value: f('messageLink', { url: after.url }), inline: true },
      { name: f('before'),  value: `> ${bc}`, inline: false },
      { name: f('after'),   value: `> ${ac}`, inline: false },
    );
  await log(before.client, e);
}

// ─── Channel events ───────────────────────────────────────────────────────────

async function onChannelCreate(channel) {
  if (!channel.guild || ignoredChannel(channel.id)) return;
  const actor = await getAuditUser(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  const e = embed('channelCreate', 'positive')
    .addFields(
      { name: f('channel'),   value: `<#${channel.id}> (\`#${channel.name}\`)`, inline: true },
      { name: f('type'),      value: channelTypeName(channel.type), inline: true },
      { name: f('createdBy'), value: actorText(actor), inline: true },
    );
  await log(channel.client, e);
}

async function onChannelDelete(channel) {
  if (!channel.guild || ignoredChannel(channel.id)) return;
  const actor = await getAuditUser(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  const e = embed('channelDelete', 'negative')
    .addFields(
      { name: f('channel'),   value: `**#${channel.name}** (\`${channel.id}\`)`, inline: true },
      { name: f('type'),      value: channelTypeName(channel.type), inline: true },
      { name: f('deletedBy'), value: actorText(actor), inline: true },
    );
  await log(channel.client, e);
}

async function onChannelUpdate(before, after) {
  if (!after.guild || ignoredChannel(after.id)) return;

  const changes = [];
  if (before.name !== after.name) {
    changes.push(t('logging.changes.channelName', { before: before.name, after: after.name }));
  }
  if (before.topic !== after.topic) {
    changes.push(t('logging.changes.topic', {
      before: before.topic || t('common.none'),
      after:  after.topic || t('common.removed'),
    }));
  }
  if (before.rateLimitPerUser !== after.rateLimitPerUser) {
    changes.push(t('logging.changes.slowmode', { before: before.rateLimitPerUser, after: after.rateLimitPerUser }));
  }
  if (before.nsfw !== after.nsfw) {
    changes.push(t('logging.changes.nsfw', { before: before.nsfw, after: after.nsfw }));
  }
  if (!changes.length) return;

  const actor = await getAuditUser(after.guild, AuditLogEvent.ChannelUpdate, after.id);
  const e = embed('channelUpdate', 'neutral')
    .addFields(
      { name: f('channel'),   value: `<#${after.id}>`, inline: true },
      { name: f('updatedBy'), value: actorText(actor), inline: true },
      { name: f('changes'),   value: changes.join('\n'), inline: false },
    );
  await log(after.client, e);
}

// ─── Role events ──────────────────────────────────────────────────────────────

async function onRoleCreate(role) {
  const actor = await getAuditUser(role.guild, AuditLogEvent.RoleCreate, role.id);
  const e = embed('roleCreate', 'positive')
    .addFields(
      { name: f('role'),      value: `${role} (\`${role.id}\`)`, inline: true },
      { name: f('createdBy'), value: actorText(actor), inline: true },
    );
  await log(role.client, e);
}

async function onRoleDelete(role) {
  const actor = await getAuditUser(role.guild, AuditLogEvent.RoleDelete, role.id);
  const e = embed('roleDelete', 'negative')
    .addFields(
      { name: f('role'),      value: `**${role.name}** (\`${role.id}\`)`, inline: true },
      { name: f('deletedBy'), value: actorText(actor), inline: true },
    );
  await log(role.client, e);
}

async function onRoleUpdate(before, after) {
  const changes = [];
  if (before.name !== after.name) {
    changes.push(t('logging.changes.name', { before: before.name, after: after.name }));
  }
  if (before.color !== after.color) {
    changes.push(t('logging.changes.color', {
      before: before.color.toString(16).padStart(6, '0'),
      after:  after.color.toString(16).padStart(6, '0'),
    }));
  }
  if (before.hoist !== after.hoist) {
    changes.push(t('logging.changes.hoist', { before: before.hoist, after: after.hoist }));
  }
  if (before.mentionable !== after.mentionable) {
    changes.push(t('logging.changes.mentionable', { before: before.mentionable, after: after.mentionable }));
  }

  const permChanges = [];
  for (const [perm, value] of Object.entries(after.permissions.serialize())) {
    if (before.permissions.has(perm) !== value) permChanges.push(`${value ? '✅' : '❌'} \`${perm}\``);
  }
  if (permChanges.length) {
    let permText = permChanges.join('\n');
    // An embed field caps at 1024 characters, and a role rewrite can change
    // thirty permissions at once.
    if (permText.length > 900) {
      permText = permChanges.slice(0, 10).join('\n') + t('logging.changes.morePermissions', { count: permChanges.length - 10 });
    }
    changes.push(t('logging.changes.permissions', { list: permText }));
  }

  if (!changes.length) return;

  const actor = await getAuditUser(after.guild, AuditLogEvent.RoleUpdate, after.id);
  const e = embed('roleUpdate', permChanges.length ? 'negative' : 'neutral')
    .addFields(
      { name: f('role'),      value: `${after}`, inline: true },
      { name: f('updatedBy'), value: actorText(actor), inline: true },
      { name: f('changes'),   value: changes.join('\n'), inline: false },
    );
  await log(after.client, e);
}

// ─── Voice events ─────────────────────────────────────────────────────────────

async function onVoiceStateUpdate(before, after) {
  const member = after.member ?? before.member;
  const client = after.client ?? before.client;
  if (!member || ignoredUser(member.id)) return;

  const userField = { name: f('user'), value: `${member} (\`${member.user.username}\`)`, inline: true };

  if (before.channel?.id !== after.channel?.id) {
    let e = null;
    if (!before.channel && after.channel && on('voiceJoin') && !ignoredChannel(after.channel.id)) {
      e = embed('voiceJoin', 'positive')
        .addFields(userField, { name: f('channel'), value: `**${after.channel.name}**`, inline: true });
    } else if (before.channel && !after.channel && on('voiceLeave') && !ignoredChannel(before.channel.id)) {
      e = embed('voiceLeave', 'muted')
        .addFields(userField, { name: f('channel'), value: `**${before.channel.name}**`, inline: true });
    } else if (before.channel && after.channel && on('voiceMove')) {
      e = embed('voiceMove', 'neutral')
        .addFields(
          userField,
          { name: f('from'), value: `**${before.channel.name}**`, inline: true },
          { name: f('to'),   value: `**${after.channel.name}**`, inline: true },
        );
    }
    if (e) await log(client, e);
  }

  if (before.serverMute !== after.serverMute && on('voiceMute')) {
    const e = embed(after.serverMute ? 'voiceMute' : 'voiceUnmute', after.serverMute ? 'negative' : 'positive')
      .addFields(userField);
    if (after.channel) e.addFields({ name: f('channel'), value: `**${after.channel.name}**`, inline: true });
    await log(client, e);
  }

  if (before.serverDeaf !== after.serverDeaf && on('voiceDeafen')) {
    const e = embed(after.serverDeaf ? 'voiceDeafen' : 'voiceUndeafen', after.serverDeaf ? 'negative' : 'positive')
      .addFields(userField);
    if (after.channel) e.addFields({ name: f('channel'), value: `**${after.channel.name}**`, inline: true });
    await log(client, e);
  }
}

// ─── Invite events ────────────────────────────────────────────────────────────

async function onInviteCreate(invite) {
  const e = embed('inviteCreate', 'special')
    .addFields(
      { name: f('createdBy'), value: actorText(invite.inviter), inline: true },
      { name: f('code'),      value: `\`${invite.code}\``, inline: true },
      { name: f('channel'),   value: f('jumpChannel', { id: invite.channel.id }), inline: true },
      { name: f('maxUses'),   value: invite.maxUses ? String(invite.maxUses) : t('common.unlimited'), inline: true },
      { name: f('expires'),   value: invite.expiresAt ? invite.expiresAt.toUTCString() : t('common.never'), inline: true },
    );
  await log(invite.client, e);
}

async function onInviteDelete(invite) {
  const e = embed('inviteDelete', 'notice')
    .addFields(
      { name: f('code'),    value: `\`${invite.code}\``, inline: true },
      { name: f('channel'), value: f('jumpChannel', { id: invite.channel.id }), inline: true },
    );
  await log(invite.client, e);
}

module.exports = {
  onMemberJoin, onMemberRemove, onMemberUpdate, onMemberBan, onMemberUnban,
  onMessageDelete, onBulkMessageDelete, onMessageEdit,
  onChannelCreate, onChannelDelete, onChannelUpdate,
  onRoleCreate, onRoleDelete, onRoleUpdate,
  onVoiceStateUpdate,
  onInviteCreate, onInviteDelete,
};
