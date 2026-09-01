const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { applyMeta, optionText } = require('../../../core/commandKit');
const { gameColor } = require('../../../core/gameKit');
const { t } = require('../../../core/i18n');

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 10;

module.exports = {
  key: 'dice',
  game: 'dice',
  data: applyMeta(new SlashCommandBuilder(), 'dice')
    .addIntegerOption(o => o
      .setName('sides')
      .setDescription(optionText('dice', 'sides'))
      .setRequired(true)
      // The die names are notation, not words: d20 is d20 in every language.
      .addChoices(...SIDES.map(s => ({ name: `d${s}`, value: s }))))
    .addIntegerOption(o => o
      .setName('count')
      .setDescription(optionText('dice', 'count'))
      .setRequired(false)),

  async execute(interaction) {
    const sides = interaction.options.getInteger('sides');
    const count = Math.max(1, Math.min(interaction.options.getInteger('count') ?? 1, MAX_DICE));
    const die = `d${sides}`;
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);

    let description;
    if (count === 1) {
      description = t('games.dice.single', { die, result: rolls[0] });
    } else {
      description = t('games.dice.multiple', {
        count, die, total,
        rolls: rolls.map(r => `\`${r}\``).join('  +  '),
      });
      if (total === count * sides) description += t('games.dice.perfect');
      else if (total === count)    description += t('games.dice.criticalFail');
    }

    const embed = new EmbedBuilder()
      .setTitle(t('games.dice.title', { count, die }))
      .setDescription(description)
      .setColor(gameColor('neutral'))
      .setFooter({ text: t('games.dice.rolledBy', { name: interaction.user.displayName }) });

    await interaction.reply({ embeds: [embed] });
  },
};
