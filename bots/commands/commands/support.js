const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { makeEmbed, linkRow } = require('../../../core/utils');
const { applyMeta, optionText, guard } = require('../../../core/commandKit');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');

/**
 * Canned help pages.
 *
 * The five guides used to be written out here, complete with one company's
 * product names and documentation links, so every installation of this bot
 * offered help for scripts it has nothing to do with. They are
 * `features.supportGuides.guides` now: a list of entries with a value, a menu
 * name, a title and a body.
 *
 * The CHOICES are baked into the command when it is registered, which is what
 * Discord stores. Adding a guide therefore needs a restart, the same as renaming
 * a command does — the dashboard restarts the bot after a config change for
 * exactly this reason.
 */

/** The configured guides, cleaned up and capped at Discord's 25 choices. */
function guides() {
  return (config.get('features.supportGuides.guides', []) || [])
    .map(g => ({
      value:       String(g?.value ?? '').trim().slice(0, 100),
      name:        String(g?.name ?? '').trim().slice(0, 100),
      title:       String(g?.title ?? '').trim(),
      description: String(g?.description ?? '').trim(),
    }))
    .filter(g => g.value && g.name && g.description)
    .slice(0, 25);
}

function buildData() {
  const list = guides();
  const builder = applyMeta(new SlashCommandBuilder(), 'script_guides');

  return builder.addStringOption(option => {
    option
      .setName('script')
      .setDescription(optionText('script_guides', 'script'))
      .setRequired(true);
    // No configured guides means no choices. The option stays free text rather
    // than the command vanishing, so somebody who emptied the list by accident
    // gets a message saying so instead of a command that is simply gone.
    if (list.length) option.addChoices(...list.map(g => ({ name: g.name, value: g.value })));
    return option;
  });
}

module.exports = {
  key: 'script_guides',
  feature: 'supportGuides',
  data: buildData(),

  async execute(interaction) {
    if (!await guard(interaction, 'script_guides')) return;

    const list = guides();
    if (!list.length) {
      return interaction.reply({ content: t('panels.supportGuides.noneConfigured'), flags: MessageFlags.Ephemeral });
    }

    const key = interaction.options.getString('script');
    const guide = list.find(g => g.value === key);
    if (!guide) {
      return interaction.reply({ content: t('panels.supportGuides.notFound'), flags: MessageFlags.Ephemeral });
    }

    const embed = makeEmbed({
      title:       guide.title,
      description: guide.description,
      guildName:   interaction.guild.name,
    });

    const components = config.get('features.supportGuides.showLinkButtons', true) ? linkRow() : [];
    await interaction.reply({ embeds: [embed], components });
  },
};
