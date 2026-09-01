const {
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');
const { enabled } = require('../../core/commandKit');
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

  // Load command files (single export or an array of commands).
  const cmdDir = join(__dirname, 'commands');
  for (const file of readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
    const exported = require(join(cmdDir, file));
    for (const cmd of Array.isArray(exported) ? exported : [exported]) {
      if (!cmd?.data || !cmd?.execute) continue;

      // A command switched off in the config is not registered with Discord at
      // all, so it does not sit in the autocomplete looking available and then
      // refuse. `cmd.feature` lets a feature switch take the commands that only
      // make sense with it, without listing them twice.
      const key = cmd.key ?? cmd.data.name;
      if (!enabled(key, cmd.feature)) { skipped.push(key); continue; }

      // Keyed by the REGISTERED name, which is the operator's to change, so
      // routing follows a rename without a second table to keep in step.
      commands.set(cmd.data.name, cmd);
      registry.addCommand(cmd.data);
    }
  }

  client.once(Events.ClientReady, () => {
    console.log(`[Commands Bot] Ready as ${client.user.tag} - ${commands.size} commands loaded`
      + (skipped.length ? `, ${skipped.length} off (${skipped.join(', ')})` : '') + '.');
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
      // 10062 = Unknown interaction (the token was already used or expired).
      // Usually the user dismissed it or another client raced us; logging it
      // adds noise and nothing else.
      if (err.code === 10062) return;
      console.error(`[Commands Bot] Interaction error: ${err}`);
      const msg = { content: t('common.unexpectedError'), flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  });
}

// --- Persistent button handler -----------------------------------------------

/**
 * A panel posted months ago still has the custom ids it was posted with, and
 * nobody re-runs /roles after an update. The current prefix is `rolemenu_`; the
 * three older ones are matched too, because dropping them would turn every
 * button in every server that already runs this bot into a dead click with no
 * error anybody can see.
 */
const LEGACY_PREFIXES = ['rolemenu_', 'roles_', 'rules_'];

function buttonIdFromCustomId(customId) {
  for (const prefix of LEGACY_PREFIXES) {
    if (customId.startsWith(prefix)) return customId.slice(prefix.length);
  }
  return null;
}

/** The configured role menu button with this id, or null. */
function findRoleButton(id) {
  const buttons = config.get('features.roleMenu.buttons', []) || [];
  const match = buttons.find(b => String(b?.id ?? '').trim() === id);
  if (!match) return null;
  const roleId = config.roleId(match.role ?? '');
  return roleId ? { ...match, roleId } : null;
}

async function handlePersistentButton(interaction) {
  const { customId } = interaction;

  // Verification: the rules panel's own button, which grants exactly one role
  // and never takes it away.
  if (customId === 'rules_verification') return handleVerification(interaction);

  const id = buttonIdFromCustomId(customId);
  if (!id) return;

  const button = findRoleButton(id);
  if (!button) return;

  await toggleRole(interaction, button.roleId);
}

async function handleVerification(interaction) {
  const { member, guild } = interaction;
  const roleId = config.roleId(config.get('features.rules.button.grantsRole', ''));

  const role = roleId ? guild.roles.cache.get(String(roleId)) : null;
  if (!role) {
    return interaction.reply({ content: t('panels.roleMenu.verifyRoleMissing'), flags: MessageFlags.Ephemeral });
  }

  if (!member.roles.cache.has(String(roleId))) {
    await member.roles.add(role);
    await interaction.reply({ content: t('panels.roleMenu.added', { role: `<@&${roleId}>` }), flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({
      content: t('panels.roleMenu.alreadyHave', { role: `<@&${roleId}>` }),
      flags: MessageFlags.Ephemeral,
    });
  }
  setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
}

async function toggleRole(interaction, roleId) {
  const { member, guild } = interaction;
  const role = guild.roles.cache.get(String(roleId));

  if (!role) {
    return interaction.reply({ content: t('common.roleNotFound'), flags: MessageFlags.Ephemeral });
  }

  if (!member.roles.cache.has(String(roleId))) {
    await member.roles.add(role);
    await interaction.reply({ content: t('panels.roleMenu.added', { role: `<@&${roleId}>` }), flags: MessageFlags.Ephemeral });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    return;
  }

  // Already held. Either ask first, or take it straight off.
  if (config.get('features.roleMenu.confirmRemoval', true) === false) {
    await member.roles.remove(role);
    await interaction.reply({ content: t('panels.roleMenu.removed', { role: `<@&${roleId}>` }), flags: MessageFlags.Ephemeral });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    return;
  }

  const removeBtn = new ButtonBuilder()
    .setCustomId(`confirm_remove_role_${roleId}`)
    .setLabel(t('panels.roleMenu.confirmButton'))
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(removeBtn);
  await interaction.reply({ content: t('panels.roleMenu.confirmQuestion'), components: [row], flags: MessageFlags.Ephemeral });

  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({ time: 15_000, max: 1 });

  collector.on('collect', async i => {
    await member.roles.remove(role);
    await i.update({ content: t('panels.roleMenu.removed', { role: `<@&${roleId}>` }), components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  });

  collector.on('end', collected => {
    if (!collected.size) interaction.deleteReply().catch(() => {});
  });
}

module.exports = { intents, partials, attach };
