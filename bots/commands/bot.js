const {
  Client, Collection, GatewayIntentBits, Events, REST, Routes,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { readdirSync } = require('fs');
const { join }        = require('path');
const { guild: gcfg } = require('../../core/config');

function createBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.commands = new Collection();

  // Load command files (supports single export or array of commands)
  const cmdDir = join(__dirname, 'commands');
  for (const file of readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
    const exported = require(join(cmdDir, file));
    const cmds = Array.isArray(exported) ? exported : [exported];
    for (const cmd of cmds) {
      if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
    }
  }

  client.once(Events.ClientReady, async () => {
    console.log(`[Commands Bot] Ready: ${client.user.tag}`);

    try {
      const rest = new REST({ version: '10' }).setToken(client.token);
      const body = client.commands.map(c => c.data.toJSON());
      await rest.put(Routes.applicationGuildCommands(client.user.id, String(gcfg.ID)), { body });
      console.log(`[Commands Bot] ${body.length} slash commands registered.`);
    } catch (err) {
      console.error(`[Commands Bot] Failed to register commands (code ${err.code}): ${err.message}`);
      if (err.code === 50001) {
        console.error(`[Commands Bot] → Bot is missing the "applications.commands" OAuth2 scope. Re-invite the bot with that scope.`);
      }
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        await handlePersistentButton(interaction);
        return;
      }
    } catch (err) {
      console.error(`[Commands Bot] Interaction error: ${err}`);
      const msg = { content: '❌ An unexpected error occurred.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  });

  return client;
}

// ─── Persistent button handler ────────────────────────────────────────────────

async function handlePersistentButton(interaction) {
  const { customId, member, guild } = interaction;

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

  // Role present → offer removal
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

module.exports = { createBot };
