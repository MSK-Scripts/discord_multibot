const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { hasAnyRole } = require('../../../core/utils');
const { guild: gcfg } = require('../../../core/config');
const giveawayManager = require('../../../core/giveawayManager');

// Parses a short duration string like "30m", "1h", "2d", "1w" into milliseconds.
// Returns null on anything it cannot parse.
function parseDuration(str) {
  const m = /^(\d+)\s*(s|m|h|d|w)$/i.exec(String(str).trim());
  if (!m) return null;
  const unit = { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7, w: 6.048e8 }[m[2].toLowerCase()];
  const ms = Number(m[1]) * unit;
  return ms > 0 ? ms : null;
}

function gate(interaction) {
  if (!hasAnyRole(interaction, 'Manager', 'Founder')) {
    interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

// --- /g_create ---------------------------------------------------------------

const create = {
  data: new SlashCommandBuilder()
    .setName('g_create')
    .setDescription('Create a giveaway in this channel (opens a form)'),

  async execute(interaction) {
    if (!gate(interaction)) return;

    const modal = new ModalBuilder().setCustomId('g_create_modal').setTitle('Create Giveaway');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Text').setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('duration').setLabel('Duration (e.g. 30m, 1h, 2d, 1w)').setStyle(TextInputStyle.Short).setMaxLength(10).setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('winners').setLabel('Number of winners').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true).setValue('1'),
      ),
    );

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
      time: 5 * 60_000,
      filter: i => i.customId === 'g_create_modal' && i.user.id === interaction.user.id,
    }).catch(() => null);
    if (!submitted) return; // timed out / dismissed

    const title       = submitted.fields.getTextInputValue('title').trim();
    const description  = submitted.fields.getTextInputValue('description').trim();
    const durationRaw = submitted.fields.getTextInputValue('duration');
    const winnersRaw  = submitted.fields.getTextInputValue('winners');

    const ms = parseDuration(durationRaw);
    if (!ms) {
      return submitted.reply({
        content: '❌ Invalid duration. Use a number followed by `s`, `m`, `h`, `d` or `w` — e.g. `30m`, `1h`, `2d`, `1w`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const winners = parseInt(winnersRaw, 10);
    if (!Number.isInteger(winners) || winners < 1 || winners > 50) {
      return submitted.reply({
        content: '❌ Number of winners must be a whole number between 1 and 50.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const id     = giveawayManager.generateId();
    const endsAt = Date.now() + ms;
    const draft  = {
      id, title, description, winnerCount: winners, endsAt,
      hostId: interaction.user.id, participants: [], ended: false, winners: [],
    };

    const msg = await submitted.channel.send({
      content: `<@&${gcfg.GIVEAWAY_NOTIFY_ROLE_ID}>`,
      embeds: [giveawayManager.buildEmbed(draft, interaction.guild.name)],
      components: giveawayManager.buildComponents(id, false),
      allowedMentions: { roles: [String(gcfg.GIVEAWAY_NOTIFY_ROLE_ID)] },
    });

    giveawayManager.create({
      id,
      messageId: msg.id,
      channelId: submitted.channel.id,
      guildId:   interaction.guild.id,
      title, description, winnerCount: winners, endsAt,
      hostId: interaction.user.id,
    });

    return submitted.reply({
      content: `✅ Giveaway **${title}** created — ID \`${id}\`, ends <t:${Math.floor(endsAt / 1000)}:R>.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

// --- /g_end ------------------------------------------------------------------

const end = {
  data: new SlashCommandBuilder()
    .setName('g_end')
    .setDescription('End an active giveaway now and draw winners')
    .addStringOption(o => o.setName('giveaway-id').setDescription('The giveaway ID (from the embed footer)').setRequired(true)),

  async execute(interaction) {
    if (!gate(interaction)) return;

    const id = interaction.options.getString('giveaway-id');
    const gw = giveawayManager.getById(id);
    if (!gw) {
      return interaction.reply({ content: `❌ No giveaway found with ID \`${id}\`.`, flags: MessageFlags.Ephemeral });
    }
    if (gw.ended) {
      return interaction.reply({ content: `ℹ️ Giveaway \`${gw.id}\` is not active (already ended).`, flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({ content: '⏳ Ending the giveaway and drawing winners…', flags: MessageFlags.Ephemeral });
    await giveawayManager.endGiveaway(interaction.client, gw.id);
    return interaction.editReply({ content: `✅ Giveaway \`${gw.id}\` ended.` });
  },
};

// --- /g_cancel ---------------------------------------------------------------

const cancel = {
  data: new SlashCommandBuilder()
    .setName('g_cancel')
    .setDescription('Cancel an active giveaway without drawing winners')
    .addStringOption(o => o.setName('giveaway-id').setDescription('The giveaway ID (from the embed footer)').setRequired(true)),

  async execute(interaction) {
    if (!gate(interaction)) return;

    const id = interaction.options.getString('giveaway-id');
    const gw = giveawayManager.getById(id);
    if (!gw) {
      return interaction.reply({ content: `❌ No giveaway found with ID \`${id}\`.`, flags: MessageFlags.Ephemeral });
    }
    if (gw.ended) {
      return interaction.reply({ content: `ℹ️ Giveaway \`${gw.id}\` is not active (already ended) and cannot be cancelled.`, flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({ content: '⏳ Cancelling…', flags: MessageFlags.Ephemeral });
    await giveawayManager.cancel(interaction.client, gw.id);
    return interaction.editReply({ content: `✅ Giveaway \`${gw.id}\` cancelled.` });
  },
};

// --- /g_reroll ---------------------------------------------------------------

const reroll = {
  data: new SlashCommandBuilder()
    .setName('g_reroll')
    .setDescription('Draw new winner(s) for an ended giveaway')
    .addStringOption(o => o.setName('giveaway-id').setDescription('The giveaway ID (from the embed footer)').setRequired(true)),

  async execute(interaction) {
    if (!gate(interaction)) return;

    const id = interaction.options.getString('giveaway-id');
    const gw = giveawayManager.getById(id);
    if (!gw) {
      return interaction.reply({ content: `❌ No giveaway found with ID \`${id}\`.`, flags: MessageFlags.Ephemeral });
    }
    if (!gw.ended) {
      return interaction.reply({ content: `ℹ️ Giveaway \`${gw.id}\` is still active. End it with \`/g_end\` before rerolling.`, flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({ content: '⏳ Rerolling…', flags: MessageFlags.Ephemeral });
    const res = await giveawayManager.reroll(interaction.client, gw.id);
    if (res.error === 'no_entries') {
      return interaction.editReply({ content: `❌ Giveaway \`${gw.id}\` had no entries to reroll from.` });
    }
    return interaction.editReply({ content: `✅ New winner(s) drawn for \`${gw.id}\`.` });
  },
};

// --- /g_list -----------------------------------------------------------------

const list = {
  data: new SlashCommandBuilder()
    .setName('g_list')
    .setDescription('List all active giveaways'),

  async execute(interaction) {
    if (!gate(interaction)) return;

    const active = giveawayManager.listActive().filter(gw => gw.guildId === interaction.guild.id);
    if (!active.length) {
      return interaction.reply({ content: 'ℹ️ There are no active giveaways.', flags: MessageFlags.Ephemeral });
    }

    const lines = active
      .sort((a, b) => a.endsAt - b.endsAt)
      .map(gw => {
        const link = `https://discord.com/channels/${gw.guildId}/${gw.channelId}/${gw.messageId}`;
        return `• \`${gw.id}\` — **${gw.title}** — ${gw.winnerCount} winner(s), ${gw.participants.length} entries, ends <t:${Math.floor(gw.endsAt / 1000)}:R> — [jump](${link})`;
      });

    return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  },
};

module.exports = [create, end, cancel, reroll, list];
