const { GatewayIntentBits, Partials, Events } = require('discord.js');
const { presenceOptions } = require('../../core/utils');
const config = require('../../core/config');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildMessageReactions,
];

const partials = [Partials.Channel, Partials.Message];

function attach(client, registry) {
  const logging = require('./handlers/logging');
  const messageHandler = require('./handlers/messageHandler');
  const contextMenus = require('./handlers/contextMenus');

  for (const cmd of contextMenus.getCommands()) registry.addCommand(cmd);

  client.once(Events.ClientReady, async () => {
    console.log(`[Events Bot] Ready as ${client.user.tag}`);

    const guild = client.guilds.cache.get(String(config.guildId()));
    const presence = presenceOptions('events', {
      guild: guild?.name,
      members: guild?.memberCount,
    });
    if (presence) client.user.setPresence(presence);

    await updateMemberCount(client);
  });

  // ── Server event logging ──────────────────────────────────────────────────
  // Each listener is attached only when its event is switched on, so a disabled
  // event costs nothing at runtime rather than being filtered on every call.
  if (config.featureEnabled('logging')) {
    const on = (name) => config.get(`features.logging.events.${name}`, true) !== false;

    if (on('memberJoin'))   client.on(Events.GuildMemberAdd,    m => logging.onMemberJoin(m));
    if (on('memberLeave') || on('memberKick')) client.on(Events.GuildMemberRemove, m => logging.onMemberRemove(m));
    client.on(Events.GuildMemberUpdate, (b, a) => logging.onMemberUpdate(b, a));
    if (on('memberBan'))    client.on(Events.GuildBanAdd,       (g, u) => logging.onMemberBan(g, u));
    if (on('memberUnban'))  client.on(Events.GuildBanRemove,    (g, u) => logging.onMemberUnban(g, u));

    if (on('messageDelete'))     client.on(Events.MessageDelete,     msg => logging.onMessageDelete(msg));
    if (on('messageBulkDelete')) client.on(Events.MessageBulkDelete, msgs => logging.onBulkMessageDelete(msgs));
    if (on('messageEdit'))       client.on(Events.MessageUpdate,     (b, a) => logging.onMessageEdit(b, a));

    if (on('channelCreate')) client.on(Events.ChannelCreate, c => logging.onChannelCreate(c));
    if (on('channelDelete')) client.on(Events.ChannelDelete, c => logging.onChannelDelete(c));
    if (on('channelUpdate')) client.on(Events.ChannelUpdate, (b, a) => logging.onChannelUpdate(b, a));

    if (on('roleCreate')) client.on(Events.GuildRoleCreate, r => logging.onRoleCreate(r));
    if (on('roleDelete')) client.on(Events.GuildRoleDelete, r => logging.onRoleDelete(r));
    if (on('roleUpdate')) client.on(Events.GuildRoleUpdate, (b, a) => logging.onRoleUpdate(b, a));

    client.on(Events.VoiceStateUpdate, (b, a) => logging.onVoiceStateUpdate(b, a));

    if (on('inviteCreate')) client.on(Events.InviteCreate, i => logging.onInviteCreate(i));
    if (on('inviteDelete')) client.on(Events.InviteDelete, i => logging.onInviteDelete(i));
  }

  // ── Member count channel ──────────────────────────────────────────────────
  if (config.featureEnabled('memberCount')) {
    client.on(Events.GuildMemberAdd,    () => scheduleMemberCountUpdate(client));
    client.on(Events.GuildMemberRemove, () => scheduleMemberCountUpdate(client));
  }

  // ── Plain messages ────────────────────────────────────────────────────────
  client.on(Events.MessageCreate, msg => messageHandler.onMessage(msg));

  // ── Context menus ─────────────────────────────────────────────────────────
  client.on(Events.InteractionCreate, interaction => contextMenus.handleInteraction(interaction, client));
}

// Discord throttles channel renames to 2 per 10 minutes. Renaming on every join
// and leave burns that budget within seconds on a busy day, and every further
// rename is dropped by the API until the window rolls over, so the channel ends
// up showing a stale count.
//
// Trailing debounce: the first event schedules a rename, further events during
// the window are absorbed, and the rename that finally runs reads the current
// member count. The displayed number lags by at most the interval but is always
// the real one. The floor of 5 minutes is not a preference, it is the API limit.
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let memberCountTimer = null;
let memberCountLastRun = 0;

function memberCountInterval() {
  const minutes = Number(config.get('features.memberCount.intervalMinutes', 5));
  return Math.max(MIN_INTERVAL_MS, (Number.isFinite(minutes) ? minutes : 5) * 60 * 1000);
}

function scheduleMemberCountUpdate(client) {
  if (memberCountTimer) return;  // a rename is already pending

  const wait = Math.max(0, memberCountInterval() - (Date.now() - memberCountLastRun));
  memberCountTimer = setTimeout(() => {
    memberCountTimer = null;
    updateMemberCount(client);
  }, wait);
  // Do not keep the process alive just for a pending rename.
  memberCountTimer.unref?.();
}

async function updateMemberCount(client) {
  if (!config.featureEnabled('memberCount')) return;
  memberCountLastRun = Date.now();

  const guild = client.guilds.cache.get(String(config.guildId()));
  const channelId = config.channelId(config.get('features.memberCount.channelId', ''), 'memberCount');
  const channel = channelId ? client.channels.cache.get(String(channelId)) : null;
  if (!guild || !channel) return;

  const template = String(config.get('features.memberCount.template', 'Members: {count}') ?? '');
  const name = template
    .replace(/\{count\}/g, String(guild.memberCount))
    .replace(/\{guild\}/g, guild.name)
    .trim();
  // Discord rejects an empty channel name, and a template that renders to
  // nothing is a configuration mistake, not a reason to fail every five minutes.
  if (!name) return;

  await channel.setName(name.slice(0, 100)).catch(console.error);
}

module.exports = { intents, partials, attach };
