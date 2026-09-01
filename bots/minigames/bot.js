const { Collection, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');
const { presenceOptions } = require('../../core/utils');
const { t } = require('../../core/i18n');
const config = require('../../core/config');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];

const partials = [];

function attach(client, registry) {
  const commands = new Collection();
  const skipped = [];

  const cmdDir = join(__dirname, 'commands');
  for (const file of readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
    const cmd = require(join(cmdDir, file));
    if (!cmd?.data || !cmd?.execute) continue;

    // A game switched off is not registered at all, so it does not appear in
    // Discord's autocomplete only to answer that it is unavailable.
    const key = cmd.key ?? cmd.data.name;
    if (!config.gameEnabled(cmd.game ?? key) || !config.command(key).enabled) {
      skipped.push(key);
      continue;
    }

    commands.set(cmd.data.name, cmd);
    registry.addCommand(cmd.data);
  }

  client.once(Events.ClientReady, () => {
    console.log(`[Minigames Bot] Ready as ${client.user.tag} - ${commands.size} commands loaded`
      + (skipped.length ? `, ${skipped.length} off (${skipped.join(', ')})` : '') + '.');

    const guild = client.guilds.cache.get(String(config.guildId()));
    const presence = presenceOptions('minigames', { guild: guild?.name, members: guild?.memberCount });
    if (presence) client.user.setPresence(presence);
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      // 10062 = Unknown interaction (the token was already used or expired).
      if (err.code === 10062) return;
      console.error(`[Minigames Bot] ${interaction.commandName}: ${err}`);
      const msg = { content: t('common.unexpectedError'), flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  });
}

module.exports = { intents, partials, attach };
