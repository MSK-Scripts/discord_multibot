const { EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const { guild: gcfg } = require('../../../core/config');

const CHANNEL_TYPE_NAMES = {
  [ChannelType.GuildText]:        'Text',
  [ChannelType.GuildVoice]:       'Voice',
  [ChannelType.GuildCategory]:    'Category',
  [ChannelType.GuildAnnouncement]:'Announcement',
  [ChannelType.GuildForum]:       'Forum',
  [ChannelType.GuildStageVoice]:  'Stage',
  [ChannelType.GuildMedia]:       'Media',
};
function channelTypeName(type) {
  return CHANNEL_TYPE_NAMES[type] ?? `Unknown (${type})`;
}

const GREEN  = 0x57F287;
const RED    = 0xED4245;
const BLUE   = 0x5865F2;
const GOLD   = 0xFEE75C;
const ORANGE = 0xE67E22;
const GREY   = 0x95A5A6;
const PURPLE = 0x9B59B6;

function nowUtc() {
  return new Date().toUTCString().replace('GMT', 'UTC');
}

function embed(title, color, description = '') {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description || null)
    .setColor(color)
    .setFooter({ text: nowUtc() });
}

async function getLogChannel(client) {
  return client.channels.cache.get(String(gcfg.LOG_CHANNEL_ID)) ?? null;
}

async function log(client, emb) {
  const ch = await getLogChannel(client);
  if (!ch) return;
  await ch.send({ embeds: [emb] }).catch(console.error);
}

async function getAuditUser(guild, action, targetId = null, maxAgeMs = null) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 5, type: action });
    for (const entry of logs.entries.values()) {
      if (targetId && entry.target?.id !== String(targetId)) continue;
      if (maxAgeMs && Date.now() - entry.createdTimestamp > maxAgeMs) continue;
      return entry.executor;
    }
  } catch {}
  return null;
}

// ─── Member events ────────────────────────────────────────────────────────────

async function onMemberJoin(member) {
  const e = embed('📥 Member Joined', GREEN)
    .addFields(
      { name: 'User',        value: `${member} (\`${member.user.username}\`)`, inline: true },
      { name: 'ID',          value: member.id, inline: true },
      { name: 'Account Age', value: member.user.createdAt.toLocaleDateString('de-DE'), inline: true },
    )
    .setThumbnail(member.displayAvatarURL());
  await log(member.client, e);
}

async function onMemberRemove(member) {
  const actor = await getAuditUser(member.guild, AuditLogEvent.MemberKick, member.id, 5000);
  let e;
  if (actor) {
    e = embed('👢 Member Kicked', RED)
      .addFields(
        { name: 'User',      value: `**${member.user.username}** (\`${member.id}\`)`, inline: true },
        { name: 'Kicked by', value: `${actor}`, inline: true },
      );
  } else {
    const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.toString()).join(' ');
    e = embed('📤 Member Left', GREY)
      .addFields({ name: 'User', value: `**${member.user.username}** (\`${member.id}\`)`, inline: true });
    if (roles) e.addFields({ name: 'Roles', value: roles, inline: false });
  }
  e.setThumbnail(member.displayAvatarURL());
  await log(member.client, e);
}

async function onMemberUpdate(before, after) {
  if (before.user.username !== after.user.username) {
    const e = embed('✏️ Username Changed', BLUE)
      .addFields(
        { name: 'User',   value: `${after}`, inline: false },
        { name: 'Before', value: before.user.username, inline: true },
        { name: 'After',  value: after.user.username, inline: true },
      );
    await log(after.client, e);
  }

  if (before.nickname !== after.nickname) {
    const e = embed('📝 Nickname Changed', BLUE)
      .addFields(
        { name: 'User',   value: `${after}`, inline: false },
        { name: 'Before', value: before.nickname ?? '*none*', inline: true },
        { name: 'After',  value: after.nickname  ?? '*removed*', inline: true },
      );
    await log(after.client, e);
  }

  const beforeTimeout = before.communicationDisabledUntil;
  const afterTimeout  = after.communicationDisabledUntil;
  if (!beforeTimeout && afterTimeout) {
    const actor = await getAuditUser(after.guild, AuditLogEvent.MemberUpdate, after.id, 5000);
    const e = embed('⏱️ Member Timed Out', ORANGE)
      .addFields(
        { name: 'User',         value: `${after}`, inline: true },
        { name: 'Until',        value: afterTimeout.toUTCString(), inline: true },
        { name: 'Timed out by', value: actor ? `${actor}` : 'Unknown', inline: true },
      );
    await log(after.client, e);
  } else if (beforeTimeout && !afterTimeout) {
    const actor = await getAuditUser(after.guild, AuditLogEvent.MemberUpdate, after.id, 5000);
    const e = embed('✅ Timeout Removed', GREEN)
      .addFields(
        { name: 'User',       value: `${after}`, inline: true },
        { name: 'Removed by', value: actor ? `${actor}` : 'Unknown', inline: true },
      );
    await log(after.client, e);
  }

  const added   = after.roles.cache.filter(r => !before.roles.cache.has(r.id));
  // Exclude deleted roles — those no longer exist in the guild cache and are already
  // logged by onRoleDelete. Without this, every member with the role triggers a log entry.
  const removed = before.roles.cache.filter(r => !after.roles.cache.has(r.id) && after.guild.roles.cache.has(r.id));

  if (added.size || removed.size) {
    const actor = await getAuditUser(after.guild, AuditLogEvent.MemberRoleUpdate, after.id);

    if (added.size) {
      const e = embed('🟢 Role Added', GREEN)
        .addFields(
          { name: 'User',     value: `${after}`, inline: true },
          { name: 'Roles',    value: added.map(r => r.toString()).join(' '), inline: true },
          { name: 'Added by', value: actor ? `${actor}` : 'Unknown', inline: true },
        );
      await log(after.client, e);
    }

    if (removed.size) {
      const e = embed('🔴 Role Removed', RED)
        .addFields(
          { name: 'User',       value: `${after}`, inline: true },
          { name: 'Roles',      value: removed.map(r => r.toString()).join(' '), inline: true },
          { name: 'Removed by', value: actor ? `${actor}` : 'Unknown', inline: true },
        );
      await log(after.client, e);
    }
  }
}

async function onMemberBan(guild, user) {
  const actor = await getAuditUser(guild, AuditLogEvent.MemberBanAdd, user.id, 5000);
  const e = embed('🔨 Member Banned', RED)
    .addFields(
      { name: 'User',      value: `**${user.username}** (\`${user.id}\`)`, inline: true },
      { name: 'Banned by', value: actor ? `${actor}` : 'Unknown', inline: true },
    )
    .setThumbnail(user.displayAvatarURL());
  await log(guild.client, e);
}

async function onMemberUnban(guild, user) {
  const actor = await getAuditUser(guild, AuditLogEvent.MemberBanRemove, user.id);
  const e = embed('✅ Member Unbanned', GREEN)
    .addFields(
      { name: 'User',        value: `**${user.username}** (\`${user.id}\`)`, inline: true },
      { name: 'Unbanned by', value: actor ? `${actor}` : 'Unknown', inline: true },
    );
  await log(guild.client, e);
}

// ─── Message events ───────────────────────────────────────────────────────────

async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;

  let deleter = null;
  try {
    const logs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
    const entry = logs.entries.first();
    if (entry?.target?.id === message.author.id && entry.executor?.id !== message.author.id) {
      deleter = entry.executor;
    }
  } catch {}

  let content = message.content || '*[no text content]*';
  if (content.length > 1000) content = content.slice(0, 1000) + '…';

  const e = embed('🗑️ Message Deleted', RED)
    .addFields(
      { name: 'Author',  value: `${message.author} (\`${message.author.username}\`)`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
    );
  if (deleter) e.addFields({ name: 'Deleted by', value: `${deleter}`, inline: true });
  e.addFields({ name: 'Content', value: `> ${content}`, inline: false });

  if (message.attachments.size) {
    e.addFields({ name: `Attachments (${message.attachments.size})`, value: message.attachments.map(a => a.name).join(', '), inline: false });
  }

  await log(message.client, e);
}

async function onBulkMessageDelete(messages) {
  const first = messages.first();
  if (!first?.guild) return;
  const actor = await getAuditUser(first.guild, AuditLogEvent.MessageBulkDelete, first.channel.id);
  const e = embed('🗑️ Bulk Message Delete', RED)
    .addFields(
      { name: 'Channel', value: `<#${first.channel.id}>`, inline: true },
      { name: 'Deleted', value: `**${messages.size}** messages`, inline: true },
    );
  if (actor) e.addFields({ name: 'Deleted by', value: `${actor}`, inline: true });
  await log(first.client, e);
}

async function onMessageEdit(before, after) {
  if (!before.guild || before.author?.bot) return;
  if (before.content === after.content) return;

  let bc = before.content || '*[empty]*';
  let ac = after.content  || '*[empty]*';
  if (bc.length > 500) bc = bc.slice(0, 500) + '…';
  if (ac.length > 500) ac = ac.slice(0, 500) + '…';

  const e = embed('✏️ Message Edited', GOLD)
    .addFields(
      { name: 'Author',  value: `${before.author} (\`${before.author.username}\`)`, inline: true },
      { name: 'Channel', value: `<#${before.channel.id}>`, inline: true },
      { name: 'Jump to', value: `[Message](${after.url})`, inline: true },
      { name: 'Before',  value: `> ${bc}`, inline: false },
      { name: 'After',   value: `> ${ac}`, inline: false },
    );
  await log(before.client, e);
}

// ─── Channel events ───────────────────────────────────────────────────────────

async function onChannelCreate(channel) {
  if (!channel.guild) return;
  const actor = await getAuditUser(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  const e = embed('📁 Channel Created', GREEN)
    .addFields(
      { name: 'Channel',    value: `<#${channel.id}> (\`#${channel.name}\`)`, inline: true },
      { name: 'Type',       value: channelTypeName(channel.type), inline: true },
      { name: 'Created by', value: actor ? `${actor}` : 'Unknown', inline: true },
    );
  await log(channel.client, e);
}

async function onChannelDelete(channel) {
  if (!channel.guild) return;
  const actor = await getAuditUser(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  const e = embed('🗑️ Channel Deleted', RED)
    .addFields(
      { name: 'Channel',    value: `**#${channel.name}** (\`${channel.id}\`)`, inline: true },
      { name: 'Type',       value: channelTypeName(channel.type), inline: true },
      { name: 'Deleted by', value: actor ? `${actor}` : 'Unknown', inline: true },
    );
  await log(channel.client, e);
}

async function onChannelUpdate(before, after) {
  if (!after.guild) return;
  const changes = [];
  if (before.name !== after.name) changes.push(`**Name:** \`#${before.name}\` → \`#${after.name}\``);
  if (before.topic !== after.topic) changes.push(`**Topic:** ${before.topic || '*none*'} → ${after.topic || '*removed*'}`);
  if (before.rateLimitPerUser !== after.rateLimitPerUser) changes.push(`**Slowmode:** \`${before.rateLimitPerUser}s\` → \`${after.rateLimitPerUser}s\``);
  if (before.nsfw !== after.nsfw) changes.push(`**NSFW:** \`${before.nsfw}\` → \`${after.nsfw}\``);
  if (!changes.length) return;

  const actor = await getAuditUser(after.guild, AuditLogEvent.ChannelUpdate, after.id);
  const e = embed('✏️ Channel Updated', BLUE)
    .addFields(
      { name: 'Channel',    value: `<#${after.id}>`, inline: true },
      { name: 'Updated by', value: actor ? `${actor}` : 'Unknown', inline: true },
      { name: 'Changes',    value: changes.join('\n'), inline: false },
    );
  await log(after.client, e);
}

// ─── Role events ──────────────────────────────────────────────────────────────

async function onRoleCreate(role) {
  const actor = await getAuditUser(role.guild, AuditLogEvent.RoleCreate, role.id);
  const e = embed('🔑 Role Created', GREEN)
    .addFields(
      { name: 'Role',       value: `${role} (\`${role.id}\`)`, inline: true },
      { name: 'Created by', value: actor ? `${actor}` : 'Unknown', inline: true },
    );
  await log(role.client, e);
}

async function onRoleDelete(role) {
  const actor = await getAuditUser(role.guild, AuditLogEvent.RoleDelete, role.id);
  const e = embed('🗑️ Role Deleted', RED)
    .addFields(
      { name: 'Role',       value: `**${role.name}** (\`${role.id}\`)`, inline: true },
      { name: 'Deleted by', value: actor ? `${actor}` : 'Unknown', inline: true },
    );
  await log(role.client, e);
}

async function onRoleUpdate(before, after) {
  const changes = [];
  if (before.name !== after.name) changes.push(`**Name:** \`${before.name}\` → \`${after.name}\``);
  if (before.color !== after.color) changes.push(`**Color:** \`#${before.color.toString(16).padStart(6, '0')}\` → \`#${after.color.toString(16).padStart(6, '0')}\``);
  if (before.hoist !== after.hoist) changes.push(`**Displayed separately:** \`${before.hoist}\` → \`${after.hoist}\``);
  if (before.mentionable !== after.mentionable) changes.push(`**Mentionable:** \`${before.mentionable}\` → \`${after.mentionable}\``);

  const permChanges = [];
  for (const [perm, value] of Object.entries(after.permissions.serialize())) {
    if (before.permissions.has(perm) !== value) {
      permChanges.push(`${value ? '✅' : '❌'} \`${perm}\``);
    }
  }
  if (permChanges.length) {
    let permText = permChanges.join('\n');
    if (permText.length > 900) {
      permText = permChanges.slice(0, 10).join('\n') + `\n… and ${permChanges.length - 10} more`;
    }
    changes.push(`**Permissions:**\n${permText}`);
  }

  if (!changes.length) return;

  const actor = await getAuditUser(after.guild, AuditLogEvent.RoleUpdate, after.id);
  const color = permChanges.length ? RED : BLUE;
  const e = embed('✏️ Role Updated', color)
    .addFields(
      { name: 'Role',       value: `${after}`, inline: true },
      { name: 'Updated by', value: actor ? `${actor}` : 'Unknown', inline: true },
      { name: 'Changes',    value: changes.join('\n'), inline: false },
    );
  await log(after.client, e);
}

// ─── Voice events ─────────────────────────────────────────────────────────────

async function onVoiceStateUpdate(before, after) {
  const member = after.member ?? before.member;
  const client = after.client ?? before.client;

  if (before.channel?.id !== after.channel?.id) {
    let e;
    if (!before.channel && after.channel) {
      e = embed('🔊 Voice Joined', GREEN)
        .addFields(
          { name: 'User',    value: `${member} (\`${member.user.username}\`)`, inline: true },
          { name: 'Channel', value: `**${after.channel.name}**`, inline: true },
        );
    } else if (before.channel && !after.channel) {
      e = embed('🔇 Voice Left', GREY)
        .addFields(
          { name: 'User',    value: `${member} (\`${member.user.username}\`)`, inline: true },
          { name: 'Channel', value: `**${before.channel.name}**`, inline: true },
        );
    } else {
      e = embed('🔀 Voice Moved', BLUE)
        .addFields(
          { name: 'User', value: `${member} (\`${member.user.username}\`)`, inline: true },
          { name: 'From', value: `**${before.channel.name}**`, inline: true },
          { name: 'To',   value: `**${after.channel.name}**`,  inline: true },
        );
    }
    await log(client, e);
  }

  if (before.serverMute !== after.serverMute) {
    const e = embed(after.serverMute ? '🔇 Server Muted' : '🔊 Server Unmuted', after.serverMute ? RED : GREEN)
      .addFields({ name: 'User', value: `${member} (\`${member.user.username}\`)`, inline: true });
    if (after.channel) e.addFields({ name: 'Channel', value: `**${after.channel.name}**`, inline: true });
    await log(client, e);
  }

  if (before.serverDeaf !== after.serverDeaf) {
    const e = embed(after.serverDeaf ? '🔕 Server Deafened' : '🔔 Server Undeafened', after.serverDeaf ? RED : GREEN)
      .addFields({ name: 'User', value: `${member} (\`${member.user.username}\`)`, inline: true });
    if (after.channel) e.addFields({ name: 'Channel', value: `**${after.channel.name}**`, inline: true });
    await log(client, e);
  }
}

// ─── Invite events ────────────────────────────────────────────────────────────

async function onInviteCreate(invite) {
  const e = embed('🔗 Invite Created', PURPLE)
    .addFields(
      { name: 'Created by', value: invite.inviter ? `${invite.inviter}` : 'Unknown', inline: true },
      { name: 'Code',       value: `\`${invite.code}\``, inline: true },
      { name: 'Channel',    value: `<#${invite.channel.id}>`, inline: true },
      { name: 'Max Uses',   value: invite.maxUses ? String(invite.maxUses) : '∞', inline: true },
      { name: 'Expires',    value: invite.expiresAt ? invite.expiresAt.toUTCString() : 'Never', inline: true },
    );
  await log(invite.client, e);
}

async function onInviteDelete(invite) {
  const e = embed('🗑️ Invite Deleted', ORANGE)
    .addFields(
      { name: 'Code',    value: `\`${invite.code}\``, inline: true },
      { name: 'Channel', value: `<#${invite.channel.id}>`, inline: true },
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
