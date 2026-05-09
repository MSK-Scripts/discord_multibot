const {
  Client, Collection, GatewayIntentBits, Events, REST, Routes, ActivityType, MessageFlags,
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

  const cmdDir = join(__dirname, 'commands');
  for (const file of readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
    const cmd = require(join(cmdDir, file));
    if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
  }

  client.once(Events.ClientReady, async () => {
    console.log(`[Minigames Bot] Ready: ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: 'Minigames 🎮', type: ActivityType.Playing }], status: 'online' });

    console.log(`[Minigames Bot] Registering commands in guild ${gcfg.ID} ...`);
    try {
      const rest = new REST({ version: '10' }).setToken(client.token);
      const body = client.commands.map(c => c.data.toJSON());
      await rest.put(Routes.applicationGuildCommands(client.user.id, String(gcfg.ID)), { body });
      console.log(`[Minigames Bot] ${body.length} slash commands registered.`);
    } catch (err) {
      console.error(`[Minigames Bot] Failed to register commands (code ${err.code}): ${err.message}`);
      if (err.code === 50001) {
        console.error(`[Minigames Bot] → Bot is missing the "applications.commands" OAuth2 scope. Re-invite the bot with that scope.`);
      }
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`[Minigames Bot] ${interaction.commandName}: ${err}`);
      const msg = { content: '❌ An unexpected error occurred.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  });

  return client;
}

module.exports = { createBot };
