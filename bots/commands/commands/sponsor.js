const {
  SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { makeEmbed } = require('../../../core/utils');
const { applyMeta, optionText, guard } = require('../../../core/commandKit');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');
const sponsor = require('../../../core/sponsor');

/**
 * /sponsor post  posts the GitHub Sponsors panel into the current channel.
 * /sponsor sync  runs the daily role sync now.
 *
 * ONE COMMAND WITH TWO SUBCOMMANDS rather than two commands: both belong to the
 * same feature and the same people, so one entry in the command table and one
 * role gate cover both. The panel's button is `sponsor_verify` and is answered
 * in bots/commands/bot.js, like every other persistent button.
 */

function panel(interaction) {
  const s = sponsor.settings();
  const embed = makeEmbed({
    title:       t('sponsor.panel.title'),
    description: t('sponsor.panel.description', {
      brand: config.brandName() || interaction.guild.name,
      minutes: Math.round(sponsor.LINK_TTL_SECONDS / 60),
    }),
    guildName:   interaction.guild.name,
  });

  const row = new ActionRowBuilder();
  // Left out without a URL: a link button needs one, and a panel that refuses
  // to post over an optional button is worse than a panel without it.
  if (s.sponsorsUrl) {
    row.addComponents(new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(s.sponsorsUrl)
      .setLabel(t('sponsor.panel.sponsorButton')));
  }
  row.addComponents(new ButtonBuilder()
    .setCustomId(sponsor.VERIFY_BUTTON_ID)
    .setStyle(ButtonStyle.Success)
    .setLabel(t('sponsor.panel.verifyButton')));

  return { embeds: [embed], components: [row] };
}

async function post(interaction) {
  const s = sponsor.settings();
  if (!s.ready) {
    console.warn(`[Sponsor] /sponsor post refused, not configured: ${s.missing.join(', ')}`);
    return interaction.reply({ content: t('sponsor.notConfigured'), flags: MessageFlags.Ephemeral });
  }
  await interaction.channel.send(panel(interaction));
  await interaction.reply({ content: t('sponsor.posted'), flags: MessageFlags.Ephemeral });
}

async function sync(interaction) {
  const s = sponsor.settings();
  if (!s.ready) {
    console.warn(`[Sponsor] /sponsor sync refused, not configured: ${s.missing.join(', ')}`);
    return interaction.reply({ content: t('sponsor.notConfigured'), flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  console.log(`[Sponsor] manual sync requested by ${interaction.user.id}.`);
  // force bypasses the removal brake for this one run only. The daily run
  // never sets it: a mass removal always needs a human to look first.
  const force = interaction.options.getBoolean('force') === true;
  const result = await sponsor.runSync(interaction.client, { force });

  let content;
  if (result.ok) {
    content = t('sponsor.sync.done', { added: result.added, removed: result.removed, failed: result.failed, listed: result.listed });
    if (result.braked) content += '\n' + t('sponsor.sync.braked', { count: result.heldBack });
  }
  else if (result.reason === 'busy') content = t('sponsor.sync.busy');
  else content = t('sponsor.sync.failed');
  await interaction.editReply({ content });
}

module.exports = {
  key: 'sponsor',
  feature: 'sponsor',
  data: applyMeta(new SlashCommandBuilder(), 'sponsor')
    .addSubcommand(sub => sub.setName('post').setDescription(optionText('sponsor', 'post')))
    .addSubcommand(sub => sub.setName('sync').setDescription(optionText('sponsor', 'sync'))
      .addBooleanOption(o => o.setName('force').setDescription(optionText('sponsor', 'force')).setRequired(false))),

  async execute(interaction) {
    if (!await guard(interaction, 'sponsor')) return;
    const sub = interaction.options.getSubcommand(false);
    if (sub === 'sync') return sync(interaction);
    return post(interaction);
  },
};
