const {
  GatewayIntentBits, Partials, Events, ActivityType,
} = require('discord.js');
const { guild: gcfg } = require('../../core/config');

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
  const logging        = require('./handlers/logging');
  const messageHandler = require('./handlers/messageHandler');
  const contextMenus   = require('./handlers/contextMenus');

  // Register context menu commands into the combined registry
  for (const cmd of contextMenus.getCommands()) {
    registry.addCommand(cmd);
  }

  client.once(Events.ClientReady, async () => {
    console.log(`[Events Bot] Ready as ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: 'MSK Scripts', type: ActivityType.Playing }], status: 'online' });
    await updateMemberCount(client);
  });

  // Member events
  client.on(Events.GuildMemberAdd,    m    => logging.onMemberJoin(m));
  client.on(Events.GuildMemberRemove, m    => logging.onMemberRemove(m));
  client.on(Events.GuildMemberUpdate, (b, a) => logging.onMemberUpdate(b, a));
  client.on(Events.GuildBanAdd,       (g, u) => logging.onMemberBan(g, u));
  client.on(Events.GuildBanRemove,    (g, u) => logging.onMemberUnban(g, u));

  // Message events
  client.on(Events.MessageDelete,     msg  => logging.onMessageDelete(msg));
  client.on(Events.MessageBulkDelete, msgs => logging.onBulkMessageDelete(msgs));
  client.on(Events.MessageUpdate,     (b, a) => logging.onMessageEdit(b, a));

  // Channel events
  client.on(Events.ChannelCreate, c => logging.onChannelCreate(c));
  client.on(Events.ChannelDelete, c => logging.onChannelDelete(c));
  client.on(Events.ChannelUpdate, (b, a) => logging.onChannelUpdate(b, a));

  // Role events
  client.on(Events.GuildRoleCreate, r => logging.onRoleCreate(r));
  client.on(Events.GuildRoleDelete, r => logging.onRoleDelete(r));
  client.on(Events.GuildRoleUpdate, (b, a) => logging.onRoleUpdate(b, a));

  // Voice events
  client.on(Events.VoiceStateUpdate, (b, a) => logging.onVoiceStateUpdate(b, a));

  // Invite events
  client.on(Events.InviteCreate, i => logging.onInviteCreate(i));
  client.on(Events.InviteDelete, i => logging.onInviteDelete(i));

  // Member count update on join/leave (debounced, see below)
  client.on(Events.GuildMemberAdd,    () => scheduleMemberCountUpdate(client));
  client.on(Events.GuildMemberRemove, () => scheduleMemberCountUpdate(client));

  // Messages
  client.on(Events.MessageCreate, msg => messageHandler.onMessage(msg));

  // Interactions (context menus only)
  client.on(Events.InteractionCreate, interaction => contextMenus.handleInteraction(interaction, client));
}

// Discord throttles channel renames to 2 per 10 minutes. Renaming on every join
// and leave burns that budget within seconds on a busy day, and every further
// rename is dropped by the API until the window rolls over, so the channel ends
// up showing a stale count.
//
// Trailing debounce: the first event schedules a rename, further events during
// the window are absorbed, and the rename that finally runs reads the current
// member count. The displayed number lags by at most MEMBER_COUNT_INTERVAL_MS
// but is always the real one.
const MEMBER_COUNT_INTERVAL_MS = 5 * 60 * 1000;

let memberCountTimer   = null;
let memberCountLastRun = 0;

function scheduleMemberCountUpdate(client) {
  if (memberCountTimer) return;  // a rename is already pending

  const wait = Math.max(0, MEMBER_COUNT_INTERVAL_MS - (Date.now() - memberCountLastRun));
  memberCountTimer = setTimeout(() => {
    memberCountTimer = null;
    updateMemberCount(client);
  }, wait);
  // Do not keep the process alive just for a pending rename.
  memberCountTimer.unref?.();
}

async function updateMemberCount(client) {
  memberCountLastRun = Date.now();

  const guild   = client.guilds.cache.get(String(gcfg.ID));
  const channel = client.channels.cache.get(String(gcfg.MEMBER_COUNT_CHANNEL_ID));
  if (guild && channel) {
    await channel.setName(`𝑴𝒆𝒎𝒃𝒆𝒓𝒔: ${guild.memberCount}`).catch(console.error);
  }
}

module.exports = { intents, partials, attach };
