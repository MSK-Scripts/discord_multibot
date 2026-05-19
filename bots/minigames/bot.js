const {
  Collection, GatewayIntentBits, Events, ActivityType, MessageFlags,
} = require('discord.js');
const { readdirSync } = require('fs');
const { join }        = require('path');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];

const partials = [];

function attach(client, registry) {
  const commands = new Collection();

  const cmdDir = join(__dirname, 'commands');
  for (const file of readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
    const cmd = require(join(cmdDir, file));
    if (cmd.data && cmd.execute) {
      commands.set(cmd.data.name, cmd);
      registry.addCommand(cmd.data);
    }
  }

  client.once(Events.ClientReady, () => {
    console.log(`[Minigames Bot] Ready as ${client.user.tag} - ${commands.size} commands loaded.`);
    client.user.setPresence({ activities: [{ name: 'Minigames 🎮', type: ActivityType.Playing }], status: 'online' });
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      // 10062 = Unknown interaction (interaction token already used/expired).
      if (err.code === 10062) return;
      console.error(`[Minigames Bot] ${interaction.commandName}: ${err}`);
      const msg = { content: '❌ An unexpected error occurred.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  });
}

module.exports = { intents, partials, attach };
