const {
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { readdirSync } = require('fs');
const { join }        = require('path');
const { guild: gcfg } = require('../../core/config');
const giveawayManager = require('../../core/giveawayManager');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];

const partials = [];

function attach(client, registry) {
  const commands = new Collection();

  // Load command files (supports single export or array of commands)
  const cmdDir = join(__dirname, 'commands');
  for (const file of readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
    const exported = require(join(cmdDir, file));
    const cmds = Array.isArray(exported) ? exported : [exported];
    for (const cmd of cmds) {
      if (cmd.data && cmd.execute) {
        commands.set(cmd.data.name, cmd);
        registry.addCommand(cmd.data);
      }
    }
  }

  client.once(Events.ClientReady, () => {
    console.log(`[Commands Bot] Ready as ${client.user.tag} - ${commands.size} commands loaded.`);
    giveawayManager.init(client);
  });

  client.on(Events.InteractionCreate, async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = commands.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        await handlePersistentButton(interaction);
        return;
      }
    } catch (err) {
      // 10062 = Unknown interaction (interaction token already used/expired).
      // Silently ignore - usually means another client raced us or the user is offline.
      if (err.code === 10062) return;
      console.error(`[Commands Bot] Interaction error: ${err}`);
      const msg = { content: '❌ An unexpected error occurred.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  });
}

// --- Persistent button handler -----------------------------------------------

async function handlePersistentButton(interaction) {
  const { customId, member, guild } = interaction;

  // Giveaway join/leave toggle (customId = "giveaway_join:<id>")
  if (customId.startsWith(giveawayManager.JOIN_PREFIX)) {
    return handleGiveawayJoin(interaction, customId.slice(giveawayManager.JOIN_PREFIX.length));
  }

  // Verification
  if (customId === 'rules_verification') {
    const role = guild.roles.cache.get(String(gcfg.MEMBER_ROLE_ID));
    if (!role) {
      return interaction.reply({ content: '❌ Verification role not found. Please contact an admin.', flags: MessageFlags.Ephemeral });
    }
    if (!member.roles.cache.has(String(gcfg.MEMBER_ROLE_ID))) {
      await member.roles.add(role);
      await interaction.reply({ content: `Role <@&${gcfg.MEMBER_ROLE_ID}> was added to you.`, flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    } else {
      await interaction.reply({
        content: `You already have the role <@&${gcfg.MEMBER_ROLE_ID}>.\nYou cannot remove this role!`,
        flags: MessageFlags.Ephemeral,
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    }
    return;
  }

  // Toggle-role buttons
  const toggleMap = {
    'rules_giveaway_notify': gcfg.GIVEAWAY_NOTIFY_ROLE_ID,
    'roles_garage':          gcfg.GARAGE_ROLE_ID,
    'roles_handcuffs':       gcfg.HANDCUFFS_ROLE_ID,
    'roles_storage':         gcfg.STORAGE_ROLE_ID,
    'roles_vehicle_keys':    gcfg.VEHICLEKEYS_ROLE_ID,
  };

  if (toggleMap[customId] !== undefined) {
    await toggleRole(interaction, toggleMap[customId]);
  }
}

async function handleGiveawayJoin(interaction, giveawayId) {
  const gw = giveawayManager.getById(giveawayId);

  if (!gw || gw.ended) {
    // Disable the stale button best-effort so it stops inviting clicks.
    await interaction.update({ components: giveawayManager.buildComponents(giveawayId, true) }).catch(() => {});
    return interaction.followUp({ content: 'ℹ️ This giveaway has ended.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  // Team members are excluded from giveaways.
  if (interaction.member.roles.cache.has(String(gcfg.TEAM_ROLE_ID))) {
    return interaction.reply({
      content: '❌ Team members are not eligible to enter giveaways.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const res = giveawayManager.toggleParticipant(gw.id, interaction.user.id);
  if (!res) {
    return interaction.reply({ content: 'ℹ️ This giveaway is no longer active.', flags: MessageFlags.Ephemeral });
  }

  await interaction.update({
    embeds: [giveawayManager.buildEmbed(res.giveaway, interaction.guild?.name ?? '')],
    components: giveawayManager.buildComponents(gw.id, false),
  });
  return interaction.followUp({
    content: res.joined ? '🎉 You have entered the giveaway! Good luck!' : '👋 You have left the giveaway.',
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

async function toggleRole(interaction, roleId) {
  const { member, guild } = interaction;
  const role = guild.roles.cache.get(String(roleId));

  if (!role) {
    return interaction.reply({ content: '❌ Role not found. Please contact an admin.', flags: MessageFlags.Ephemeral });
  }

  if (!member.roles.cache.has(String(roleId))) {
    await member.roles.add(role);
    await interaction.reply({ content: `Role <@&${roleId}> was added to you.`, flags: MessageFlags.Ephemeral });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    return;
  }

  // Role present -> offer removal
  const removeBtn = new ButtonBuilder()
    .setCustomId(`confirm_remove_role_${roleId}`)
    .setLabel('Remove Role')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(removeBtn);
  await interaction.reply({ content: 'Want to remove the role?', components: [row], flags: MessageFlags.Ephemeral });

  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({ time: 15_000, max: 1 });

  collector.on('collect', async i => {
    await member.roles.remove(role);
    await i.update({ content: `Role <@&${roleId}> was removed.`, components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  });

  collector.on('end', collected => {
    if (!collected.size) interaction.deleteReply().catch(() => {});
  });
}

module.exports = { intents, partials, attach };
